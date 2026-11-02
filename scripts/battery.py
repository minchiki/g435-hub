"""Чтение заряда G435 через донгл 046D:0ACB (Windows, только стандартная библиотека).

Протокол взят из deddroid/logitech-g435-battery (MIT, commit df31bd6) и статьи
endes «USB HID down the rabbit hole» — не выведен нами из захватов.
Vendor collection FFC0, report 6: feature-отчёты по 64 байта через Realtek-мост.
Мост переводится в «bootloader» (звук пропадает ~1 с), выход — всегда в finally.

Отправляются только: вход/выход моста, REMOTE_GET_CONNECT_STATUS, REMOTE_GET_MODE,
OTA GET_BATTERY. REMOTE_SET_MODE — только с флагом --allow-set-mode.
"""

import argparse
import ctypes as C
from ctypes import wintypes as W
import re
import sys
import time

REPORT_ID = 6
FEATURE_LEN = 64
INPUT_LEN = 8
ENTER_BOOTLOADER, EXIT_BOOTLOADER, SEND_COMMAND = b"\x01\x03", b"\x08\x03", b"\x04\x03"
ACK_OK, ACK_ALREADY = 0x5A, 0xFE
CAT_OTA, CAT_WIRELESS = 0x06, 0x0E
GET_MODE, SET_MODE, GET_CONNECT = 0xE0, 0xE1, 0xE3
CURVE = [(4200, 100), (4150, 95), (4100, 90), (4050, 85), (4000, 80), (3950, 75),
         (3900, 70), (3850, 62), (3800, 55), (3750, 41), (3720, 34), (3705, 29),
         (3700, 27), (3690, 17), (3675, 11), (3650, 9), (3600, 7), (3550, 5),
         (3500, 4), (3450, 2), (3400, 1), (3300, 0)]  # низ откалиброван, см. docs/battery.md

k = C.WinDLL("kernel32", use_last_error=True)
s = C.WinDLL("setupapi", use_last_error=True)
h = C.WinDLL("hid", use_last_error=True)
INVALID = C.c_void_p(-1).value
VERBOSE = False


class GUID(C.Structure):
    _fields_ = [("Data1", W.DWORD), ("Data2", W.WORD), ("Data3", W.WORD),
                ("Data4", C.c_ubyte * 8)]


class InterfaceData(C.Structure):
    _fields_ = [("cbSize", W.DWORD), ("InterfaceClassGuid", GUID),
                ("Flags", W.DWORD), ("Reserved", C.c_size_t)]


class Caps(C.Structure):
    _fields_ = [("Usage", W.USHORT), ("UsagePage", W.USHORT)] + [("_r", W.USHORT * 30)]


class Overlapped(C.Structure):
    _fields_ = [("Internal", C.c_size_t), ("InternalHigh", C.c_size_t),
                ("Offset", W.DWORD), ("OffsetHigh", W.DWORD), ("hEvent", W.HANDLE)]


def bind(dll, name, restype, *argtypes):
    fn = getattr(dll, name)
    fn.restype, fn.argtypes = restype, list(argtypes)
    return fn


ptr = C.c_void_p
get_guid = bind(h, "HidD_GetHidGuid", None, C.POINTER(GUID))
get_devs = bind(s, "SetupDiGetClassDevsW", ptr, C.POINTER(GUID), W.LPCWSTR, ptr, W.DWORD)
enum = bind(s, "SetupDiEnumDeviceInterfaces", W.BOOL, ptr, ptr, C.POINTER(GUID), W.DWORD, C.POINTER(InterfaceData))
detail = bind(s, "SetupDiGetDeviceInterfaceDetailW", W.BOOL, ptr, C.POINTER(InterfaceData), ptr, W.DWORD, C.POINTER(W.DWORD), ptr)
destroy = bind(s, "SetupDiDestroyDeviceInfoList", W.BOOL, ptr)
open_file = bind(k, "CreateFileW", W.HANDLE, W.LPCWSTR, W.DWORD, W.DWORD, ptr, W.DWORD, W.DWORD, W.HANDLE)
close = bind(k, "CloseHandle", W.BOOL, W.HANDLE)
read_file = bind(k, "ReadFile", W.BOOL, W.HANDLE, ptr, W.DWORD, C.POINTER(W.DWORD), C.POINTER(Overlapped))
get_result = bind(k, "GetOverlappedResult", W.BOOL, W.HANDLE, C.POINTER(Overlapped), C.POINTER(W.DWORD), W.BOOL)
wait = bind(k, "WaitForSingleObject", W.DWORD, W.HANDLE, W.DWORD)
cancel = bind(k, "CancelIo", W.BOOL, W.HANDLE)
create_event = bind(k, "CreateEventW", W.HANDLE, ptr, W.BOOL, W.BOOL, W.LPCWSTR)
set_feature = bind(h, "HidD_SetFeature", C.c_ubyte, W.HANDLE, ptr, W.ULONG)
get_feature = bind(h, "HidD_GetFeature", C.c_ubyte, W.HANDLE, ptr, W.ULONG)
get_ppd = bind(h, "HidD_GetPreparsedData", C.c_ubyte, W.HANDLE, C.POINTER(ptr))
free_ppd = bind(h, "HidD_FreePreparsedData", C.c_ubyte, ptr)
get_caps = bind(h, "HidP_GetCaps", W.LONG, ptr, C.POINTER(Caps))


def log(msg):
    if VERBOSE:
        print("  " + msg)


def find_vendor_path():
    """Путь к коллекции FFC0 донгла 0ACB (на Windows каждая TLC — отдельный путь)."""
    guid = GUID()
    get_guid(C.byref(guid))
    info = get_devs(C.byref(guid), None, None, 0x12)
    if info == INVALID:
        raise C.WinError(C.get_last_error())
    try:
        index = 0
        while True:
            iface = InterfaceData(cbSize=C.sizeof(InterfaceData))
            if not enum(info, None, C.byref(guid), index, C.byref(iface)):
                return None
            index += 1
            needed = W.DWORD()
            detail(info, C.byref(iface), None, 0, C.byref(needed), None)
            buf = C.create_string_buffer(needed.value)
            C.cast(buf, C.POINTER(W.DWORD))[0] = 8 if C.sizeof(ptr) == 8 else 6
            if not detail(info, C.byref(iface), buf, len(buf), C.byref(needed), None):
                continue
            path = C.wstring_at(C.addressof(buf) + 4)
            if not re.search(r"vid_046d&pid_0acb", path, re.I):
                continue
            handle = open_file(path, 0, 3, None, 3, 0, None)
            if handle == INVALID:
                continue
            try:
                ppd, caps = ptr(), Caps()
                if get_ppd(handle, C.byref(ppd)):
                    get_caps(ppd, C.byref(caps))
                    free_ppd(ppd)
                    if caps.UsagePage == 0xFFC0:
                        return path
            finally:
                close(handle)
    finally:
        destroy(info)


class Dongle:
    def __init__(self, path):
        # GENERIC_READ|GENERIC_WRITE, shared R/W, OPEN_EXISTING, FILE_FLAG_OVERLAPPED
        self.handle = open_file(path, 0xC0000000, 3, None, 3, 0x40000000, None)
        if self.handle == INVALID:
            raise C.WinError(C.get_last_error())
        self.event = create_event(None, True, False, None)

    def close(self):
        close(self.event)
        close(self.handle)

    def read_input(self, timeout_ms):
        buf = C.create_string_buffer(INPUT_LEN)
        ov = Overlapped(hEvent=self.event)
        n = W.DWORD()
        if not read_file(self.handle, buf, INPUT_LEN, None, C.byref(ov)):
            if C.get_last_error() != 997:  # ERROR_IO_PENDING
                raise C.WinError(C.get_last_error())
            if wait(self.event, timeout_ms) != 0:
                cancel(self.handle)
                get_result(self.handle, C.byref(ov), C.byref(n), True)
                return None
        get_result(self.handle, C.byref(ov), C.byref(n), True)
        return buf.raw[:n.value]

    def bridge(self, op, body=b""):
        """Feature-отчёт мосту, затем ACK на input endpoint (кнопки громкости пропускаем)."""
        report = (bytes([REPORT_ID]) + op + body).ljust(FEATURE_LEN, b"\0")
        log(f"send {report[:3 + len(body)].hex()}")
        if not set_feature(self.handle, report, FEATURE_LEN):
            raise C.WinError(C.get_last_error())
        deadline = time.monotonic() + 0.8
        while time.monotonic() < deadline:
            data = self.read_input(100)
            if data and len(data) >= 2 and data[0] == REPORT_ID:
                log(f"ack {data.hex()}")
                return data[1]
        raise TimeoutError("мост не прислал ACK")

    def feature(self):
        buf = C.create_string_buffer(bytes([REPORT_ID]), FEATURE_LEN)
        if not get_feature(self.handle, buf, FEATURE_LEN):
            raise C.WinError(C.get_last_error())
        return buf.raw

    def drain(self):
        for _ in range(16):
            if self.feature()[1] == 0xFF:
                break

    def query(self, seq, category, length, payload, parse):
        cmd = bytes([0x50, 0x41, category, seq, length]) + bytes(payload)
        self.bridge(SEND_COMMAND, bytes([len(cmd)]) + cmd)
        deadline = time.monotonic() + 1.5
        while time.monotonic() < deadline:
            buf = self.feature()
            if buf[1] != 0xFF:
                log(f"reply {buf.rstrip(bytes([0xFF])).hex()}")
                value = parse(buf)
                if value is not None:
                    return value
                continue
            time.sleep(0.03)
        return None


def parse_remote(cmd):
    def parse(buf):
        for i in range(len(buf) - 3):
            if buf[i] == 0x02 and buf[i + 1] == 0x00 and buf[i + 2] == cmd:
                return buf[i + 3]
    return parse


def parse_battery(buf):
    for i in range(len(buf) - 6):
        w = buf[i:i + 7]
        if w[0] == 0x07 and w[1] == 0x00 and w[2] == CAT_OTA and w[3] & 0x80 and w[4] == 0:
            mv = int.from_bytes(w[5:7], "little")
            if 2500 <= mv <= 4600:
                return mv


def percent(mv):
    if mv >= CURVE[0][0]:
        return 100
    for (hi_mv, hi_p), (lo_mv, lo_p) in zip(CURVE, CURVE[1:]):
        if mv >= lo_mv:
            return round(lo_p + (mv - lo_mv) / (hi_mv - lo_mv) * (hi_p - lo_p))
    return 0


def main():
    global VERBOSE
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("-v", "--verbose", action="store_true", help="печатать байты обмена")
    ap.add_argument("--allow-set-mode", action="store_true",
                    help="разрешить REMOTE_SET_MODE 1, если донгл в другом режиме")
    args = ap.parse_args()
    VERBOSE = args.verbose

    path = find_vendor_path()
    if not path:
        sys.exit("Донгл 046D:0ACB (коллекция FFC0) не найден.")
    dev = Dongle(path)
    try:
        ack = dev.bridge(ENTER_BOOTLOADER)
        if ack not in (ACK_OK, ACK_ALREADY):
            print(f"Неожиданный ACK входа: {ack:02x}")
        try:
            dev.drain()
            connected = dev.query(1, CAT_WIRELESS, 1, [GET_CONNECT], parse_remote(GET_CONNECT))
            print(f"Связь с гарнитурой: {connected}")
            if connected == 0:
                sys.exit("Гарнитура выключена или не связана с донглом.")
            mode = dev.query(2, CAT_WIRELESS, 1, [GET_MODE], parse_remote(GET_MODE))
            print(f"Remote mode: {mode}")
            seq = 3
            if mode != 1:
                if not args.allow_set_mode:
                    sys.exit("Режим не 1: заряд не читается. Переключение не выполнено "
                             "(нужен --allow-set-mode).")
                dev.query(seq, CAT_WIRELESS, 2, [SET_MODE, 0x01], lambda b: True)
                seq += 1
            mv = dev.query(seq, CAT_OTA, 1, [0x00, 0x31], parse_battery)
            if mv is None:
                sys.exit("Ответа с напряжением нет.")
            print(f"Батарея: {mv} мВ, примерно {percent(mv)}% (оценка по кривой разрядки)")
        finally:
            dev.bridge(EXIT_BOOTLOADER)
    finally:
        dev.close()


if __name__ == "__main__":
    main()
