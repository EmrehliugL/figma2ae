#!/usr/bin/env python3
"""Monta o zip de instalação completo (para quem ainda não tem o Figma2AE).

Uso: python3 tools/montar_instalador.py <versão> <pasta do Studio empacotado (Figma2AE Studio-win32-x64)>
Saída: dist/<versão>/Figma2AE_v<versão>.zip
"""
import os, shutil, sys, zipfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def crlf(path):
    b = open(path, "rb").read().replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
    open(path, "wb").write(b)

def main(version, studio_dir):
    out = os.path.join(ROOT, "dist", version)
    stage = os.path.join(out, "_stage", "Figma2AE")
    shutil.rmtree(os.path.join(out, "_stage"), ignore_errors=True)
    inst = os.path.join(ROOT, "installer")
    shutil.copytree(inst, stage, ignore=shutil.ignore_patterns("Ativar extensoes sem assinatura.reg"))
    shutil.copytree(os.path.join(ROOT, "figma-plugin"), os.path.join(stage, "1 - Plugin Figma"))
    ext = os.path.join(stage, "2 - Extensao After Effects")
    shutil.copytree(os.path.join(ROOT, "extension"), os.path.join(ext, "com.iug.figma2ae"))
    shutil.copy(os.path.join(inst, "Ativar extensoes sem assinatura.reg"), ext)
    os.makedirs(os.path.join(stage, "3 - Script After Effects (alternativo)"))
    shutil.copy(os.path.join(ROOT, "after-effects", "Figma2AE.jsx"), os.path.join(stage, "3 - Script After Effects (alternativo)"))
    shutil.copytree(studio_dir, os.path.join(stage, "4 - Figma2AE Studio"))
    shutil.copy(os.path.join(ROOT, "studio", "app", "icon.ico"), os.path.join(stage, "4 - Figma2AE Studio", "icon.ico"))
    for r, _, fs in os.walk(stage):
        for f in fs:
            if f.endswith((".bat", ".reg", ".txt")):
                crlf(os.path.join(r, f))
    zpath = os.path.join(out, f"Figma2AE_v{version}.zip")
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        base = os.path.dirname(stage)
        for r, _, fs in os.walk(stage):
            for f in fs:
                p = os.path.join(r, f)
                z.write(p, os.path.relpath(p, base))
    shutil.rmtree(os.path.join(out, "_stage"))
    print(zpath)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    main(sys.argv[1], sys.argv[2])
