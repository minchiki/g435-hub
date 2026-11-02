"""Пересобирает GLB для хаба: меньше памяти в WebView2.

- baseColor из GLB убирается: каждая расцветка — отдельный JPEG, приложение держит в памяти одну;
- metallicRoughness заменяется переданным JPEG (2048²);
- clearcoat удаляется, specular-текстура тоже (коэффициент остаётся);
- неиспользуемые TEXCOORD_1..3 удаляются.
Запуск: python -I scripts/repack_glb.py src.glb mr.jpg out.glb
"""

import json
import struct
import sys
from pathlib import Path


def main(src, mr_jpg, out):
    data = Path(src).read_bytes()
    jlen = struct.unpack_from("<I", data, 12)[0]
    gltf = json.loads(data[20:20 + jlen])
    blob = data[20 + jlen + 8:]

    mat = gltf["materials"][0]
    pbr = mat["pbrMetallicRoughness"]
    ext = mat.get("extensions", {})
    # лак на всём материале, включая ткань, давал пластиковый блеск — убираем
    ext.pop("KHR_materials_clearcoat", None)
    if "extensionsUsed" in gltf:
        gltf["extensionsUsed"] = [e for e in gltf["extensionsUsed"] if e != "KHR_materials_clearcoat"]
    ext.get("KHR_materials_specular", {}).pop("specularTexture", None)
    pbr["metallicFactor"] = 1.0  # металличность целиком в текстуре (там 0)

    for mesh in gltf["meshes"]:
        for prim in mesh["primitives"]:
            for k in ("TEXCOORD_1", "TEXCOORD_2", "TEXCOORD_3"):
                prim["attributes"].pop(k, None)

    # собираем заново только нужные bufferViews
    used_acc = sorted({i for m in gltf["meshes"] for p in m["primitives"]
                       for i in [*p["attributes"].values(), p.get("indices")] if i is not None})
    new_views, new_blob = [], bytearray()

    def add_view(raw, extra=None):
        while len(new_blob) % 4:
            new_blob.append(0)
        view = {"buffer": 0, "byteOffset": len(new_blob), "byteLength": len(raw)}
        if extra:
            view.update(extra)
        new_blob.extend(raw)
        new_views.append(view)
        return len(new_views) - 1

    view_map = {}
    accessors = []
    for i in used_acc:
        acc = dict(gltf["accessors"][i])
        old = gltf["bufferViews"][acc["bufferView"]]
        if acc["bufferView"] not in view_map:
            raw = blob[old.get("byteOffset", 0):][:old["byteLength"]]
            extra = {k: old[k] for k in ("byteStride", "target") if k in old}
            view_map[acc["bufferView"]] = add_view(raw, extra)
        acc["bufferView"] = view_map[acc["bufferView"]]
        accessors.append(acc)
    acc_map = {old: new for new, old in enumerate(used_acc)}
    for mesh in gltf["meshes"]:
        for prim in mesh["primitives"]:
            prim["attributes"] = {k: acc_map[v] for k, v in prim["attributes"].items()}
            if "indices" in prim:
                prim["indices"] = acc_map[prim["indices"]]

    images = [{"bufferView": add_view(Path(mr_jpg).read_bytes()), "mimeType": "image/jpeg"}]
    sampler = gltf["textures"][pbr["baseColorTexture"]["index"]].get("sampler")
    textures = [{"source": 0}]
    if sampler is not None:
        textures[0]["sampler"] = sampler
    del pbr["baseColorTexture"]
    pbr["metallicRoughnessTexture"] = {"index": 0}

    gltf.update(accessors=accessors, bufferViews=new_views, images=images, textures=textures)
    gltf["buffers"] = [{"byteLength": len(new_blob)}]
    gltf["asset"]["extras"]["modified"] = "per-class roughness map, clearcoat removed (G435 Hub)"

    js = json.dumps(gltf, separators=(",", ":"), ensure_ascii=False).encode()
    js += b" " * (-len(js) % 4)
    new_blob += b"\0" * (-len(new_blob) % 4)
    total = 12 + 8 + len(js) + 8 + len(new_blob)
    with open(out, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        f.write(struct.pack("<II", len(new_blob), 0x004E4942) + new_blob)
    print(f"{out}: {total / 1e6:.2f} MB")


if __name__ == "__main__":
    main(*sys.argv[1:4])
