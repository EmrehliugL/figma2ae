#!/usr/bin/env python3
"""Gera o instalador universal (um .exe): plugin do Figma + extensão do After + Figma2AE Studio.

Uso: python3 tools/montar_setup.py <versão> <pasta do Studio empacotado (Figma2AE Studio-win32-x64)>
Saída: dist/<versão>/Figma2AE_Setup_v<versão>.exe   (precisa do makensis: apt install nsis)
"""
import os, shutil, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main(version, studio_dir):
    out = os.path.join(ROOT, "dist", version)
    stage = os.path.join(out, "_setup")
    shutil.rmtree(stage, ignore_errors=True)
    os.makedirs(stage)
    shutil.copytree(os.path.join(ROOT, "figma-plugin"), os.path.join(stage, "plugin"))
    shutil.copytree(os.path.join(ROOT, "extension"), os.path.join(stage, "extension"))
    shutil.copytree(studio_dir, os.path.join(stage, "studio"))
    shutil.copytree(os.path.join(ROOT, "installer", "Tutorial"), os.path.join(stage, "tutorial"))
    shutil.copy(os.path.join(ROOT, "studio", "app", "icon.ico"), os.path.join(stage, "icon.ico"))
    exe = os.path.join(out, f"Figma2AE_Setup_v{version}.exe")
    subprocess.run(["makensis", "-V2", f"-DVERSION={version}", f"-DSRC={stage}", f"-DOUTFILE={exe}",
                    os.path.join(ROOT, "installer", "setup.nsi")], check=True)
    shutil.rmtree(stage)
    print(exe)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    main(sys.argv[1], sys.argv[2])
