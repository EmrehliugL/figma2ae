#!/usr/bin/env python3
"""Publica uma atualização do Figma2AE.

Uso:
  python3 tools/publicar.py 2.3.1 "O que mudou nesta versão"            # só gera dist/2.3.1/
  python3 tools/publicar.py 2.3.1 "O que mudou" --release               # gera e publica no GitHub Releases
  (no GitHub Actions o workflow chama com --no-stamp, porque a versão já veio no commit)

Gera:
  dist/<versão>/figma2ae-update.zip   pacote com plugin/, extension/, studio/app.asar.bin e version.json
  dist/<versão>/latest.json           { version, notes, file, sha256, size, date }

Quem tem o Figma2AE instalado vê "Atualização disponível" no plugin e no painel do After
e atualiza com um clique (o receptor baixa de .../releases/latest/download/).
"""
import hashlib, json, os, re, subprocess, sys, zipfile, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = "EmrehliugL/figma2ae"
ASAR_JS = os.environ.get("ASAR_JS", "/home/claude/elec/node_modules/@electron/asar/lib/asar.js")


def stamp(version):
    def sub(path, pattern, repl):
        p = os.path.join(ROOT, path)
        s = open(p, encoding="utf-8").read()
        s2 = re.sub(pattern, repl, s)
        open(p, "w", encoding="utf-8").write(s2)
    json.dump({"version": version}, open(os.path.join(ROOT, "extension", "version.json"), "w"))
    sub("after-effects/Figma2AE.jsx", r'var VERSION = "[^"]*"', f'var VERSION = "{version}"')
    sub("extension/CSXS/manifest.xml", r'(Version|ExtensionBundleVersion)="\d+\.\d+\.\d+"', lambda m: f'{m.group(1)}="{version}"')
    sub("studio/app/package.json", r'"version": "[^"]*"', f'"version": "{version}"')
    # a biblioteca do After dentro da extensão é uma cópia do script
    src = open(os.path.join(ROOT, "after-effects", "Figma2AE.jsx"), encoding="utf-8").read()
    open(os.path.join(ROOT, "extension", "jsx", "Figma2AE.jsx"), "w", encoding="utf-8").write(src)


def build(version, notes):
    out = os.path.join(ROOT, "dist", version)
    os.makedirs(out, exist_ok=True)
    asar = os.path.join(out, "app.asar")
    if os.path.exists(ASAR_JS):
        subprocess.run(["node", "--input-type=module", "-e",
                        f"import * as a from '{ASAR_JS}'; await (a.createPackage||a.default.createPackage)('{ROOT}/studio/app', '{asar}');"],
                       check=True, cwd=os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(ASAR_JS)))))
    else:  # GitHub Actions / outra máquina
        subprocess.run(["npx", "--yes", "@electron/asar", "pack", os.path.join(ROOT, "studio", "app"), asar], check=True)
    zpath = os.path.join(out, "figma2ae-update.zip")
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        z.writestr("version.json", json.dumps({"version": version}))
        for f in ("code.js", "ui.html", "manifest.json"):
            z.write(os.path.join(ROOT, "figma-plugin", f), "plugin/" + f)
        ext = os.path.join(ROOT, "extension")
        for r, _, files in os.walk(ext):
            for f in files:
                p = os.path.join(r, f)
                z.write(p, "extension/" + os.path.relpath(p, ext).replace(os.sep, "/"))
        z.write(asar, "studio/app.asar.bin")
    os.remove(asar)
    data = open(zpath, "rb").read()
    latest = {"version": version, "notes": notes, "file": "figma2ae-update.zip",
              "sha256": hashlib.sha256(data).hexdigest(), "size": len(data),
              "date": datetime.date.today().isoformat()}
    json.dump(latest, open(os.path.join(out, "latest.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return out, latest


def release(version, notes, out):
    assets = [os.path.join(out, f) for f in sorted(os.listdir(out)) if f.endswith((".zip", ".json"))]
    subprocess.run(["gh", "release", "create", "v" + version, "--repo", REPO, "--title", "Figma2AE " + version,
                    "--notes", notes, "--latest"] + assets, check=True)


if __name__ == "__main__":
    if len(sys.argv) < 3 or not re.match(r"^\d+\.\d+\.\d+$", sys.argv[1]):
        print(__doc__); sys.exit(1)
    v, notes = sys.argv[1], sys.argv[2]
    if "--no-stamp" not in sys.argv:
        stamp(v)
    out, latest = build(v, notes)
    print(json.dumps(latest, ensure_ascii=False, indent=1))
    if "--release" in sys.argv:
        release(v, notes, out)
        print("publicado:", f"https://github.com/{REPO}/releases/tag/v{v}")
