/*  Figma2AE — painel do After Effects
 *  Importa o pacote .f2ae.zip exportado pelo plugin do Figma e reconstrói o projeto:
 *  uma composição por cena, camadas nativas (texto, shape, imagem, precomp) e pastas organizadas.
 *  Não cria animação: só prepara a estrutura.
 *
 *  Instalação: copie para  %APPDATA%\Adobe\After Effects\<versão>\Scripts\ScriptUI Panels
 *  e ative Preferências > Scripting e Expressões > "Permitir que scripts gravem arquivos e acessem a rede".
 */
(function F2AE(thisObj) {
    var VERSION = "2.3.5";
    var SETTINGS = "Figma2AE";
    var IS_WIN = $.os.toLowerCase().indexOf("windows") >= 0;

    /* ============================================================ utilidades ES3 */
    function each(a, fn) { for (var i = 0; i < a.length; i++) fn(a[i], i); }
    function idx(a, v) { for (var i = 0; i < a.length; i++) if (a[i] === v) return i; return -1; }
    function trim(s) { return String(s).replace(/^\s+|\s+$/g, ""); }
    function num(v, d) { var n = parseFloat(v); return isNaN(n) ? d : n; }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function parseJSON(s) {
        if (typeof JSON !== "undefined" && JSON.parse) return JSON.parse(s);
        return eval("(" + s + ")"); // pacote gerado pelo próprio plugin
    }
    function getSetting(k, d) { try { if (app.settings.haveSetting(SETTINGS, k)) return app.settings.getSetting(SETTINGS, k); } catch (e) {} return d; }
    function setSetting(k, v) { try { app.settings.saveSetting(SETTINGS, k, String(v)); } catch (e) {} }
    function readText(file) { file.encoding = "UTF-8"; if (!file.open("r")) throw new Error("Não consegui abrir " + file.fsName); var s = file.read(); file.close(); return s; }
    function canWriteFiles() {
        try { return app.preferences.getPrefAsLong("Main Pref Section", "Pref_SCRIPTING_FILE_NETWORK_SECURITY") === 1; } catch (e) { return true; }
    }
    function asciiOnly(s) { return /^[\x20-\x7e]*$/.test(s); }

    /* ============================================================ matriz 2x3 */
    function decompose(m) {
        var sx = Math.sqrt(m.a * m.a + m.b * m.b) || 1e-9;
        var det = m.a * m.d - m.b * m.c;
        return { rot: Math.atan2(m.b, m.a) * 180 / Math.PI, sx: sx, sy: det / sx };
    }

    /* ============================================================ SVG path -> Shape do AE */
    function parsePath(d) {
        var tok = String(d).match(/[MLCQZmlcqzHVhv]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) || [];
        var subs = [], cur = null, i = 0, cmd = "", px = 0, py = 0, sx0 = 0, sy0 = 0;
        function n() { return parseFloat(tok[i++]); }
        function start(x, y) { cur = { v: [[x, y]], it: [[0, 0]], ot: [[0, 0]], closed: false }; subs.push(cur); px = sx0 = x; py = sy0 = y; }
        function lineTo(x, y) { if (!cur) start(px, py); cur.v.push([x, y]); cur.it.push([0, 0]); cur.ot.push([0, 0]); px = x; py = y; }
        function cubic(x1, y1, x2, y2, x, y) {
            if (!cur) start(px, py);
            var L = cur.v.length - 1;
            cur.ot[L] = [x1 - cur.v[L][0], y1 - cur.v[L][1]];
            cur.v.push([x, y]); cur.it.push([x2 - x, y2 - y]); cur.ot.push([0, 0]);
            px = x; py = y;
        }
        while (i < tok.length) {
            var t = tok[i];
            if (/^[A-Za-z]$/.test(t)) { cmd = t; i++; }
            var rel = cmd === cmd.toLowerCase() && cmd !== "z" ? true : false;
            var C = cmd.toUpperCase();
            if (C === "Z") { if (cur) cur.closed = true; px = sx0; py = sy0; cur = null; if (/^[A-Za-z]$/.test(tok[i] || "")) continue; else if (i < tok.length) { i++; } continue; }
            var ox = rel ? px : 0, oy = rel ? py : 0;
            if (C === "M") { start(n() + ox, n() + oy); cmd = rel ? "l" : "L"; }
            else if (C === "L") lineTo(n() + ox, n() + oy);
            else if (C === "H") lineTo(n() + ox, py);
            else if (C === "V") lineTo(px, n() + oy);
            else if (C === "C") { var a1 = n() + ox, b1 = n() + oy, a2 = n() + ox, b2 = n() + oy, a3 = n() + ox, b3 = n() + oy; cubic(a1, b1, a2, b2, a3, b3); }
            else if (C === "Q") { var qx = n() + ox, qy = n() + oy, ex = n() + ox, ey = n() + oy;
                cubic(px + 2 / 3 * (qx - px), py + 2 / 3 * (qy - py), ex + 2 / 3 * (qx - ex), ey + 2 / 3 * (qy - ey), ex, ey); }
            else i++;
        }
        // fecha: se o último vértice repete o primeiro, junta os dois
        var out = [];
        each(subs, function (s) {
            if (s.v.length < 2) return;
            var L = s.v.length - 1;
            if (s.closed && Math.abs(s.v[L][0] - s.v[0][0]) < 0.001 && Math.abs(s.v[L][1] - s.v[0][1]) < 0.001) {
                s.it[0] = s.it[L]; s.v.pop(); s.it.pop(); s.ot.pop();
            }
            out.push(s);
        });
        return out;
    }
    function toShape(s, dx, dy) {
        var sh = new Shape(), v = [], it = [], ot = [];
        each(s.v, function (p, k) { v.push([p[0] + dx, p[1] + dy]); it.push(s.it[k]); ot.push(s.ot[k]); });
        sh.vertices = v; sh.inTangents = it; sh.outTangents = ot; sh.closed = true;
        return sh;
    }

    /* ============================================================ pacote */
    function unzip(zipFile) {
        var base = String(zipFile.displayName || File.decode(zipFile.name)).replace(/\.zip$/i, "").replace(/\.f2ae$/i, "");
        var finalDir = new Folder(zipFile.parent.fsName + "/" + base + "_F2AE");
        var tmp = new Folder(Folder.temp.fsName + "/f2ae_" + new Date().getTime());
        tmp.create();
        var src = zipFile;
        if (!asciiOnly(zipFile.fsName)) { src = new File(tmp.fsName + "/pacote.zip"); zipFile.copy(src); }
        var out = new Folder(tmp.fsName + "/x"); out.create();
        var outTxt = "";
        if (IS_WIN) {
            var bat = new File(tmp.fsName + "\\f2ae_unzip.bat");
            var S = src.fsName, O = out.fsName;
            bat.encoding = "UTF-8"; bat.lineFeed = "Windows"; bat.open("w");
            bat.writeln("@echo off");
            bat.writeln('"%SystemRoot%\\System32\\tar.exe" -xf "' + S + '" -C "' + O + '" 2>&1');
            bat.writeln('if exist "' + O + '\\figma2ae.json" exit /b 0');
            bat.writeln('"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath \'' + S.replace(/'/g, "''") + '\' -DestinationPath \'' + O.replace(/'/g, "''") + '\' -Force" 2>&1');
            bat.close();
            try { outTxt = system.callSystem('cmd.exe /c "' + bat.fsName + '"'); } catch (e) { outTxt = "callSystem: " + e.message; }
            if (!new File(O + "/figma2ae.json").exists) {
                try { outTxt += "\n" + system.callSystem(bat.fsName); } catch (e2) { outTxt += "\ncallSystem2: " + e2.message; }
            }
        } else {
            try { outTxt = system.callSystem('ditto -x -k "' + src.fsName + '" "' + out.fsName + '"'); } catch (e3) { outTxt = e3.message; }
        }
        var manifest = new File(out.fsName + "/figma2ae.json");
        if (!manifest.exists) throw new Error("Não consegui extrair o pacote automaticamente.\nAlternativa: extraia o .zip (botão direito > Extrair tudo) e escolha o figma2ae.json de dentro da pasta.\n\nDetalhe técnico: " + String(outTxt || "(sem saída)").substr(0, 400));
        // copia pra pasta final ao lado do zip (File.copy lida com acentos)
        copyTree(out, finalDir);
        return finalDir;
    }
    function copyTree(from, to) {
        if (!to.exists) to.create();
        var items = from.getFiles();
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            var nm = File.decode(it.name);
            if (it instanceof Folder) copyTree(it, new Folder(to.fsName + "/" + nm));
            else it.copy(to.fsName + "/" + nm);
        }
    }

    /* ============================================================ projeto */
    function findFolder(parent, name) {
        var items = parent ? parent.items : app.project.rootFolder.items;
        for (var i = 1; i <= items.length; i++) { var it = items[i]; if (it instanceof FolderItem && it.name === name) return it; }
        return null;
    }
    function ensureFolder(name, parent) {
        var f = findFolder(parent || app.project.rootFolder, name);
        if (!f) { f = app.project.items.addFolder(name); if (parent) f.parentFolder = parent; }
        return f;
    }
    function uniqueCompName(folder, name) {
        var taken = {}, items = folder.items;
        for (var i = 1; i <= items.length; i++) taken[items[i].name] = true;
        if (!taken[name]) return name;
        var k = 2; while (taken[name + "_" + k]) k++;
        return name + "_" + k;
    }

    function deaccent(t) {
        var from = "áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ", to = "aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN", o = "";
        for (var i = 0; i < t.length; i++) { var k = from.indexOf(t.charAt(i)); o += k >= 0 ? to.charAt(k) : t.charAt(i); }
        return o;
    }
    function Ctx(pkg, dir, opts) {
        this.pkg = pkg; this.dir = dir; this.opts = opts;
        this.footage = {}; this.missingFonts = {}; this.notes = []; this.layers = 0; this.precomps = 0;
        var rootName = "FIGMA_" + deaccent(String(pkg.file || "PROJECT")).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").toUpperCase();
        this.root = ensureFolder(rootName);
        this.fComps = ensureFolder("COMPOSITIONS", this.root);
        this.fAssets = ensureFolder("ASSETS", this.root);
        this.fImages = ensureFolder("IMAGES", this.fAssets);
        this.fVectors = ensureFolder("VECTORS", this.fAssets);
        this.fOther = ensureFolder("OTHER", this.fAssets);
        this.fPre = ensureFolder("PRECOMPS", this.fOther);
        this.fMaster = ensureFolder("MASTER_COMPOSITION", this.root);
        this.fNulls = ensureFolder("NULLS", this.fOther);
        this.fRef = ensureFolder("REFERENCIA_FIGMA", this.fAssets);
    }
    Ctx.prototype.importAsset = function (rel) {
        if (this.footage[rel]) return this.footage[rel];
        var f = new File(this.dir.fsName + "/" + rel);
        if (!f.exists) throw new Error("Arquivo do pacote não encontrado: " + rel);
        f = this.toLibrary(f);
        var item = app.project.importFile(new ImportOptions(f));
        item.parentFolder = rel.indexOf("/IMAGES/") >= 0 ? this.fImages : rel.indexOf("/VECTORS/") >= 0 ? this.fVectors : rel.indexOf("/REF/") >= 0 ? this.fRef : this.fOther;
        this.footage[rel] = item;
        return item;
    };

    // Copia cada arquivo para Documentos\Figma2AE\Biblioteca (sem duplicar), para que apagar
    // o histórico de pacotes recebidos não quebre projetos do After já montados.
    Ctx.prototype.toLibrary = function (f) {
        if (this.opts && this.opts.library === false) return f;
        try {
            if (!this.lib) {
                var slug = deaccent(String(this.pkg.file || "PROJETO")).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").substring(0, 60) || "PROJETO";
                var base = new Folder(Folder.myDocuments.fsName + "/Figma2AE/Biblioteca");
                if (!base.exists) base.create();
                this.lib = new Folder(base.fsName + "/" + slug);
                if (!this.lib.exists) this.lib.create();
            }
            var name = f.length + "_" + decodeURI(f.name), dst = new File(this.lib.fsName + "/" + name);
            if (dst.exists && dst.length === f.length) return dst;
            if (f.copy(dst.fsName)) return dst;
        } catch (e) {}
        return f;
    };

    /* ============================================================ camadas */
    var BLEND = { MULTIPLY: "MULTIPLY", SCREEN: "SCREEN", OVERLAY: "OVERLAY", DARKEN: "DARKEN", LIGHTEN: "LIGHTEN", COLOR_DODGE: "COLOR_DODGE",
        COLOR_BURN: "COLOR_BURN", HARD_LIGHT: "HARD_LIGHT", SOFT_LIGHT: "SOFT_LIGHT", DIFFERENCE: "DIFFERENCE", EXCLUSION: "EXCLUSION",
        HUE: "HUE", SATURATION: "SATURATION", COLOR: "COLOR", LUMINOSITY: "LUMINOSITY", LINEAR_BURN: "LINEAR_BURN", LINEAR_DODGE: "LINEAR_DODGE" };

    function tr(layer) { return layer.property("ADBE Transform Group"); }
    function applyXf(layer, xf, extraScale) {
        var d = decompose(xf), t = tr(layer);
        t.property("ADBE Anchor Point").setValue([0, 0]);
        t.property("ADBE Position").setValue([xf.tx, xf.ty]);
        t.property("ADBE Scale").setValue([d.sx * 100 * extraScale, d.sy * 100 * extraScale]);
        if (Math.abs(d.rot) > 0.001) t.property("ADBE Rotate Z").setValue(d.rot);
    }
    function common(layer, spec) {
        try { layer.name = spec.name || layer.name; } catch (e) {}
        if (spec.opacity !== undefined && spec.opacity < 0.999) tr(layer).property("ADBE Opacity").setValue(spec.opacity * 100);
        if (spec.blend && BLEND[spec.blend]) { try { layer.blendingMode = BlendingMode[BLEND[spec.blend]]; } catch (e) {} }
        if (spec.effects) each(spec.effects, function (fx) { addEffect(layer, fx); });
    }
    function setByMatch(effect, match, value, scale255) {
        var p = effect.property(match);
        if (!p) return;
        if (scale255) { var max = 255; try { if (p.hasMax) max = p.maxValue; } catch (e) {} value = max <= 100.5 ? value * 100 : value * 255; }
        try { p.setValue(value); } catch (e) {}
    }
    function addEffect(layer, fx) {
        var parade = layer.property("ADBE Effect Parade");
        try {
            if (fx.type === "shadow") {
                var e = parade.addProperty("ADBE Drop Shadow");
                setByMatch(e, "ADBE Drop Shadow-0001", [fx.color[0], fx.color[1], fx.color[2], 1]);
                setByMatch(e, "ADBE Drop Shadow-0002", fx.alpha, true);
                var dir = Math.atan2(fx.dx, -fx.dy) * 180 / Math.PI; if (dir < 0) dir += 360;
                setByMatch(e, "ADBE Drop Shadow-0003", dir);
                setByMatch(e, "ADBE Drop Shadow-0004", Math.sqrt(fx.dx * fx.dx + fx.dy * fx.dy));
                setByMatch(e, "ADBE Drop Shadow-0005", fx.radius);
            } else if (fx.type === "blur") {
                var b = parade.addProperty("ADBE Gaussian Blur 2");
                setByMatch(b, "ADBE Gaussian Blur 2-0001", fx.radius);
            }
        } catch (err) {}
    }
    function addPathGroup(contents, name, geoms, dx, dy) {
        var g = contents.addProperty("ADBE Vector Group"); g.name = name;
        var v = g.property("ADBE Vectors Group");
        var rule = 1;
        each(geoms, function (gm) {
            if (gm.rule === "EVENODD") rule = 2;
            each(parsePath(gm.data), function (s) {
                var p = v.addProperty("ADBE Vector Shape - Group");
                p.property("ADBE Vector Shape").setValue(toShape(s, dx, dy));
            });
        });
        return { group: g, vectors: v, rule: rule };
    }
    function addFill(vectors, f, rule) {
        var fill = vectors.addProperty("ADBE Vector Graphic - Fill");
        fill.property("ADBE Vector Fill Color").setValue([f.color[0], f.color[1], f.color[2], 1]);
        if (f.alpha !== undefined && f.alpha < 0.999) fill.property("ADBE Vector Fill Opacity").setValue(f.alpha * 100);
        if (rule === 2) { try { fill.property("ADBE Vector Fill Rule").setValue(2); } catch (e) {} }
        return fill;
    }
    // contorno nativo: grupo com a linha central (primitivo ou path) + Offset Paths (dentro/fora) + Stroke(s)
    var CAPV = { butt: 1, round: 2, square: 3 }, JOINV = { miter: 1, round: 2, bevel: 3 };
    function addStrokeGroup(contents, spec, dx, dy) {
        var ss = spec.strokes || [];
        if (!ss.length) return null;
        var g = contents.addProperty("ADBE Vector Group"); g.name = "Contorno";
        var v = g.property("ADBE Vectors Group");
        if (spec.prim === "rect") {
            var r = v.addProperty("ADBE Vector Shape - Rect");
            r.property("ADBE Vector Rect Size").setValue([spec.w, spec.h]);
            r.property("ADBE Vector Rect Position").setValue([spec.w / 2 + dx, spec.h / 2 + dy]);
            if (spec.radius) r.property("ADBE Vector Rect Roundness").setValue(Math.min(spec.radius, Math.min(spec.w, spec.h) / 2));
        } else if (spec.prim === "ellipse") {
            var el = v.addProperty("ADBE Vector Shape - Ellipse");
            el.property("ADBE Vector Ellipse Size").setValue([spec.w, spec.h]);
            el.property("ADBE Vector Ellipse Position").setValue([spec.w / 2 + dx, spec.h / 2 + dy]);
        } else {
            each(spec.strokePaths || [], function (gm) {
                each(parsePath(gm.data), function (sp) {
                    var p = v.addProperty("ADBE Vector Shape - Group");
                    p.property("ADBE Vector Shape").setValue(toShape(sp, dx, dy));
                });
            });
        }
        var s0 = ss[0];
        if (s0.align === "INSIDE" || s0.align === "OUTSIDE") {
            // o AE centraliza o traço na linha: desloca a linha meio traço pra dentro/fora (igual ao Figma)
            try {
                var off = v.addProperty("ADBE Vector Filter - Offset");
                off.property("ADBE Vector Offset Amount").setValue((s0.align === "INSIDE" ? -1 : 1) * s0.width / 2);
                off.property("ADBE Vector Offset Line Join").setValue(s0.join === "miter" ? 1 : s0.join === "round" ? 2 : 3);
                off.name = s0.align === "INSIDE" ? "Traço por dentro" : "Traço por fora";
            } catch (e) {}
        }
        each(ss, function (s) {
            var st = v.addProperty("ADBE Vector Graphic - Stroke");
            st.property("ADBE Vector Stroke Color").setValue([s.color[0], s.color[1], s.color[2], 1]);
            st.property("ADBE Vector Stroke Width").setValue(s.width);
            if (s.alpha < 0.999) st.property("ADBE Vector Stroke Opacity").setValue(s.alpha * 100);
            try { st.property("ADBE Vector Stroke Line Cap").setValue(CAPV[s.cap] || 1); } catch (e) {}
            try { st.property("ADBE Vector Stroke Line Join").setValue(JOINV[s.join] || 1); } catch (e) {}
            try { if (s.miter) st.property("ADBE Vector Stroke Miter Limit").setValue(Math.max(1, s.miter)); } catch (e) {}
            if (s.dash && s.dash.length) {
                try {
                    var d = st.property("ADBE Vector Stroke Dashes"), arr = s.dash.length % 2 ? s.dash.concat(s.dash) : s.dash;
                    for (var k = 0; k < Math.min(arr.length, 6); k++) d.addProperty(k % 2 ? "ADBE Vector Stroke Gap " + ((k >> 1) + 1) : "ADBE Vector Stroke Dash " + ((k >> 1) + 1)).setValue(Math.max(0.01, arr[k]));
                } catch (e) {}
            }
        });
        return g;
    }
    function buildShape(comp, spec) {
        var layer = comp.layers.addShape();
        var contents = layer.property("ADBE Root Vectors Group");
        var i;
        // no AE o que vem primeiro fica por cima: contorno, depois preenchimentos
        addStrokeGroup(contents, spec, 0, 0);
        if (spec.strokeGeometry && spec.strokeGeometry.length && spec.strokeFill) {
            var sg = addPathGroup(contents, "Contorno (forma)", spec.strokeGeometry, 0, 0);
            addFill(sg.vectors, spec.strokeFill, 1);
        }
        if (spec.fills && spec.fills.length) {
            if (spec.prim === "rect" || spec.prim === "ellipse") {
                var g = contents.addProperty("ADBE Vector Group"); g.name = spec.prim === "rect" ? "Retângulo" : "Elipse";
                var v = g.property("ADBE Vectors Group");
                if (spec.prim === "rect") {
                    var r = v.addProperty("ADBE Vector Shape - Rect");
                    r.property("ADBE Vector Rect Size").setValue([spec.w, spec.h]);
                    r.property("ADBE Vector Rect Position").setValue([spec.w / 2, spec.h / 2]);
                    if (spec.radius) r.property("ADBE Vector Rect Roundness").setValue(Math.min(spec.radius, Math.min(spec.w, spec.h) / 2));
                } else {
                    var el = v.addProperty("ADBE Vector Shape - Ellipse");
                    el.property("ADBE Vector Ellipse Size").setValue([spec.w, spec.h]);
                    el.property("ADBE Vector Ellipse Position").setValue([spec.w / 2, spec.h / 2]);
                }
                for (i = spec.fills.length - 1; i >= 0; i--) addFill(v, spec.fills[i], 1);
            } else if (spec.fillGeometry && spec.fillGeometry.length) {
                var fg = addPathGroup(contents, "Preenchimento", spec.fillGeometry, 0, 0);
                for (i = spec.fills.length - 1; i >= 0; i--) addFill(fg.vectors, spec.fills[i], fg.rule);
            }
        }
        applyXf(layer, spec.xf, 1);
        return layer;
    }

    var fontCache = {};
    function resolveFont(ctx, fam, sty) {
        var key = fam + "|" + sty;
        if (fontCache[key]) return fontCache[key];
        var ps = null;
        try {
            if (app.fonts && app.fonts.getFontsByFamilyNameAndStyleName) {
                var r = app.fonts.getFontsByFamilyNameAndStyleName(fam, sty);
                if (r && r.length) ps = r[0].postScriptName;
            }
        } catch (e) {}
        if (!ps) {
            ps = fam.replace(/\s+/g, "") + "-" + sty.replace(/\s+/g, "");
            ctx.missingFonts[fam + " " + sty] = true;
        }
        fontCache[key] = ps;
        return ps;
    }
    function titleCase(s) { return s.replace(/(^|\s)(\S)/g, function (a, b, c) { return b + c.toUpperCase(); }); }
    function buildText(comp, spec, ctx) {
        var txt = spec.text || "";
        if (spec.caps === "lower") txt = txt.toLowerCase();
        if (spec.caps === "title") txt = titleCase(txt);
        var slack = spec.autoResize === "WIDTH_AND_HEIGHT" ? Math.max(6, spec.w * 0.08) : 2;
        var bw = Math.max(4, spec.w + slack), bh = Math.max(4, spec.h * (spec.autoResize === "NONE" || spec.autoResize === "TRUNCATE" ? 1 : 1.35) + 2);
        var layer = comp.layers.addBoxText([bw, bh]);
        var prop = layer.property("ADBE Text Properties").property("ADBE Text Document");
        var td = prop.value;
        try { td.resetCharStyle(); td.resetParagraphStyle(); } catch (e) {}
        td.text = txt;
        try { td.font = resolveFont(ctx, spec.font.family, spec.font.style); } catch (e) { ctx.missingFonts[spec.font.family + " " + spec.font.style] = true; }
        td.fontSize = spec.size;
        td.applyFill = true;
        td.fillColor = [spec.color[0], spec.color[1], spec.color[2]];
        td.applyStroke = false;
        td.tracking = Math.round(spec.tracking || 0);
        if (spec.leading || spec.leadingAuto) { try { td.autoLeading = false; td.leading = spec.leading || spec.leadingAuto; } catch (e) {} }
        else { try { td.autoLeading = true; } catch (e) {} }
        if (spec.caps === "upper") { try { td.allCaps = true; } catch (e) { td.text = txt.toUpperCase(); } }
        td.justification = spec.align === "CENTER" ? ParagraphJustification.CENTER_JUSTIFY : spec.align === "RIGHT" ? ParagraphJustification.RIGHT_JUSTIFY : spec.align === "JUSTIFIED" ? ParagraphJustification.FULL_JUSTIFY_LASTLINE_LEFT : ParagraphJustification.LEFT_JUSTIFY;
        if (spec.runs && spec.runs.length > 1) {
            try {
                if (typeof td.characterRange === "function") {
                    each(spec.runs, function (r) {
                        var cr = td.characterRange(r.start, r.end);
                        cr.font = resolveFont(ctx, r.family, r.style); cr.fontSize = r.size;
                        if (r.color) cr.fillColor = r.color;
                    });
                }
            } catch (e) {}
        }
        prop.setValue(td);
        if (spec.colorAlpha !== undefined && spec.colorAlpha < 0.999) {
            spec.opacity = (spec.opacity === undefined ? 1 : spec.opacity) * spec.colorAlpha;
        }
        applyXf(layer, spec.xf, 1);
        // âncora no canto superior esquerdo da CAIXA de texto (não da tinta das letras)
        var autoLH = spec.leadingAuto || spec.size * 1.21, lh = spec.leading || autoLH;
        var dy = (lh - autoLH) / 2; // o Figma centraliza a altura de linha extra; o AE começa a 1ª linha no topo da caixa
        var off = spec.align === "CENTER" ? (bw - spec.w) / 2 : spec.align === "RIGHT" ? (bw - spec.w) : 0;
        var anchored = false;
        if (spec.ink && spec.ink.w > 0) {
            // alinha a tinta do AE com a tinta do Figma (exato pra qualquer fonte)
            try {
                var ri = layer.sourceRectAtTime(0, false);
                if (ri.width > 0) {
                    var ax = ri.left - spec.ink.x;
                    if (spec.align === "CENTER") ax = ri.left + ri.width / 2 - (spec.ink.x + spec.ink.w / 2);
                    else if (spec.align === "RIGHT") ax = ri.left + ri.width - (spec.ink.x + spec.ink.w);
                    // vertical pelo centro da tinta: divide a diferença mínima de desenho entre versões da mesma fonte
                    tr(layer).property("ADBE Anchor Point").setValue([ax, ri.top + ri.height / 2 - (spec.ink.y + spec.ink.h / 2)]);
                    anchored = true;
                }
            } catch (e) {}
        }
        if (!anchored) try {
            var d2 = prop.value, bp = d2.boxTextPos;
            if (bp && bp.length === 2) { tr(layer).property("ADBE Anchor Point").setValue([bp[0] + off, bp[1] - dy - spec.size * 0.24]); anchored = true; }
        } catch (e) {}
        if (!anchored) {
            try {
                var r = layer.sourceRectAtTime(0, false);
                tr(layer).property("ADBE Anchor Point").setValue([r.left + off, r.top - spec.size * 0.22 - dy]);
            } catch (e) {}
        }
        return layer;
    }
    function buildFootage(comp, spec, ctx) {
        var item = ctx.importAsset(spec.file);
        var layer = comp.layers.add(item);
        applyXf(layer, spec.xf, 1 / (spec.scale || 1));
        return layer;
    }
    function shiftSpec(k, dx, dy) {
        k.xf = { a: k.xf.a, b: k.xf.b, c: k.xf.c, d: k.xf.d, tx: k.xf.tx + dx, ty: k.xf.ty + dy };
        if (k.kind === "group") each(k.children || [], function (c) { shiftSpec(c, dx, dy); }); // filhos de grupo estão no mesmo espaço
    }
    function buildPrecomp(comp, spec, ctx) {
        var pad = spec.pad || 0;
        var w = clamp(Math.ceil(spec.w + pad * 2), 4, 30000), h = clamp(Math.ceil(spec.h + pad * 2), 4, 30000);
        var pc = app.project.items.addComp(uniqueCompName(ctx.fPre, spec.name || "Grupo"), w, h, 1, comp.duration, comp.frameRate);
        pc.parentFolder = ctx.fPre;
        ctx.precomps++;
        var kids = spec.children || [];
        for (var i = 0; i < kids.length; i++) {
            var k = kids[i];
            if (pad) shiftSpec(k, pad, pad);
            buildLayer(pc, k, ctx);
        }
        var layer = comp.layers.add(pc);
        applyXf(layer, spec.xf, 1);
        if (pad) tr(layer).property("ADBE Anchor Point").setValue([pad, pad]);
        return layer;
    }
    function buildGroup(comp, spec, ctx) {
        // Nulos só onde ajudam: 1 por grupo de nível superior com 2+ filhos (modo "top", padrão).
        // Grupos aninhados não ganham nulo — os filhos entram direto no nulo do grupo de cima.
        var kids = spec.children || [], mode = (ctx.opts && ctx.opts.nulls) || "top";
        var depth = ctx.groupDepth || 0, before = comp.numLayers, last = null;
        ctx.groupDepth = depth + 1;
        try { for (var i = 0; i < kids.length; i++) { var l = buildLayer(comp, kids[i], ctx); if (l) last = l; } }
        finally { ctx.groupDepth = depth; }
        var added = comp.numLayers - before;
        var want = mode === "all" ? added > 0 : (mode === "top" ? depth === 0 && kids.length >= 2 && added >= 2 : false);
        if (!want) return last;
        var nl = comp.layers.addNull();
        nl.source.name = spec.name || "Grupo";
        nl.name = spec.name || "Grupo";
        try { nl.source.parentFolder = ctx.fNulls; } catch (e) {}
        applyXf(nl, spec.xf, 1);
        nl.label = 2; nl.shy = false;
        try { nl.guideLayer = true; } catch (e) {}
        // novas camadas ficam no topo (índices 2..added+1, pois o nulo é o 1)
        for (var k = 2; k <= added + 1; k++) { var c = comp.layer(k); try { if (!c.parent) c.parent = nl; } catch (e) {} }
        try { nl.moveBefore(comp.layer(2)); } catch (e) {}
        ctx.nulls = (ctx.nulls || 0) + 1;
        return nl;
    }
    function addClipMatte(comp, layer, spec) {
        // recorte com canto arredondado do frame: máscara de alfa logo acima do precomp
        var m = comp.layers.addShape();
        var v = m.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group").property("ADBE Vectors Group");
        var r = v.addProperty("ADBE Vector Shape - Rect");
        r.property("ADBE Vector Rect Size").setValue([spec.w, spec.h]);
        r.property("ADBE Vector Rect Position").setValue([spec.w / 2, spec.h / 2]);
        r.property("ADBE Vector Rect Roundness").setValue(Math.min(spec.clipRadius, Math.min(spec.w, spec.h) / 2));
        var f = v.addProperty("ADBE Vector Graphic - Fill"); f.property("ADBE Vector Fill Color").setValue([1, 1, 1, 1]);
        applyXf(m, spec.xf, 1);
        m.name = (spec.name || "Frame") + " · recorte";
        m.moveBefore(layer);
        try { layer.setTrackMatte(m, TrackMatteType.ALPHA); } catch (e) { try { layer.trackMatteType = TrackMatteType.ALPHA; } catch (e2) {} }
        try { m.enabled = false; } catch (e) {}
        return m;
    }
    /* ---------- preenchimentos recriados com recursos nativos (Gradient Ramp, máscaras, track matte, Motion Tile) ---------- */
    function rampEffect(layer, shape, p0, c0, p1, c1) {
        var fx = layer.property("ADBE Effect Parade").addProperty("ADBE Ramp");
        setByMatch(fx, "ADBE Ramp-0001", p0);
        setByMatch(fx, "ADBE Ramp-0002", [c0[0], c0[1], c0[2], 1]);
        setByMatch(fx, "ADBE Ramp-0003", p1);
        setByMatch(fx, "ADBE Ramp-0004", [c1[0], c1[1], c1[2], 1]);
        setByMatch(fx, "ADBE Ramp-0005", shape);
        return fx;
    }
    function maskPoly(layer, pts, inverted, name) {
        var m = layer.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
        var sh = new Shape(), z = []; for (var q = 0; q < pts.length; q++) z.push([0, 0]);
        sh.vertices = pts; sh.inTangents = z; sh.outTangents = z; sh.closed = true;
        m.property("ADBE Mask Shape").setValue(sh);
        if (inverted) m.inverted = true;
        if (name) m.name = name;
        return m;
    }
    function circlePts(cx, cy, r) {
        // círculo como polígono suave (64 lados): simples e exato o bastante pra máscara de anel
        var pts = [], n = 64;
        for (var i = 0; i < n; i++) { var a = i / n * Math.PI * 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
        return pts;
    }
    function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
    function solidIn(comp, color, name, w, h, ctx) {
        var l = comp.layers.addSolid([color[0], color[1], color[2]], name, Math.max(4, Math.ceil(w)), Math.max(4, Math.ceil(h)), 1);
        try { l.source.parentFolder = ctx.fOther; } catch (e) {}
        return l;
    }
    // camadas de um gradiente (multi-cor): uma rampa por trecho entre duas paradas, cada uma mascarada a partir do seu começo
    function gradientLayers(comp, pa, W, H, values, ctx, label) {
        // values: "color" (cores das paradas) ou "alpha" (transparência em tons de cinza, pro luma matte)
        var st = pa.stops, i, made = [];
        function val(s0) { return values === "alpha" ? [s0.alpha, s0.alpha, s0.alpha] : s0.color; }
        if (!st || !st.length) return made;
        if (st.length === 1) { made.push(solidIn(comp, val(st[0]), label, W, H, ctx)); return made; }
        if (pa.type === "linear") {
            var S = pa.handles.start, E = pa.handles.end;
            var dx = E[0] - S[0], dy = E[1] - S[1], len = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / len, uy = dy / len, nx = -uy, ny = ux, L = (W + H) * 4;
            for (i = 0; i < st.length - 1; i++) {
                var a = st[i], b = st[i + 1];
                var P0 = lerp(S, E, a.pos), P1 = lerp(S, E, Math.max(b.pos, a.pos + 0.0005));
                var l = solidIn(comp, [1, 1, 1], label + " " + (i + 1), W, H, ctx);
                rampEffect(l, 1, P0, val(a), P1, val(b));
                if (i > 0) maskPoly(l, [[P0[0] + nx * L, P0[1] + ny * L], [P0[0] - nx * L, P0[1] - ny * L], [P0[0] - nx * L + ux * L, P0[1] - ny * L + uy * L], [P0[0] + nx * L + ux * L, P0[1] + ny * L + uy * L]], false, "a partir da parada " + (i + 1));
                made.push(l);
            }
        } else {
            // radial (pode ser elíptico/girado): monta num círculo de raio R e deforma a camada com escala/rotação
            var C = pa.handles.center, RX = pa.handles.rx, RY = pa.handles.ry;
            var vx = [RX[0] - C[0], RX[1] - C[1]], vy = [RY[0] - C[0], RY[1] - C[1]];
            var rx = Math.sqrt(vx[0] * vx[0] + vx[1] * vx[1]) || 1, ry = Math.sqrt(vy[0] * vy[0] + vy[1] * vy[1]) || 1;
            var rot = Math.atan2(vx[1], vx[0]) * 180 / Math.PI;
            var R = 1000, far = 0, corners = [[0, 0], [W, 0], [0, H], [W, H]];
            for (i = 0; i < 4; i++) { var ddx = corners[i][0] - C[0], ddy = corners[i][1] - C[1]; far = Math.max(far, Math.sqrt(ddx * ddx + ddy * ddy)); }
            var cover = Math.min(14, far / Math.min(rx, ry) + 0.1), size = Math.min(30000, Math.ceil(2 * R * cover)), c = size / 2;
            var rings = pa.rings || [];
            for (i = 0; i < rings.length; i++) {
                var rg = rings[i];
                var l2 = solidIn(comp, [1, 1, 1], label + " " + (i + 1), size, size, ctx);
                var v0 = values === "alpha" ? [rg.a0, rg.a0, rg.a0] : rg.c0, v1 = values === "alpha" ? [rg.a1, rg.a1, rg.a1] : rg.c1;
                rampEffect(l2, 2, [c, c], v0, [c + R * rg.r1, c], v1);
                if (i > 0) maskPoly(l2, circlePts(c, c, R * rg.r0), true, "fora do anel " + i);
                var t = tr(l2);
                t.property("ADBE Anchor Point").setValue([c, c]);
                t.property("ADBE Position").setValue([C[0], C[1]]);
                t.property("ADBE Scale").setValue([rx / R * 100, ry / R * 100]);
                if (Math.abs(rot) > 0.01) t.property("ADBE Rotate Z").setValue(rot);
                made.push(l2);
            }
        }
        return made;
    }
    function precompOf(parent, layers, name, ctx) {
        var idx = []; for (var i = 0; i < layers.length; i++) idx.push(layers[i].index);
        var pc = parent.layers.precompose(idx, name, true);
        try { pc.parentFolder = ctx.fPre; } catch (e) {}
        var l = null; for (var j = 1; j <= parent.numLayers; j++) if (parent.layer(j).source === pc) { l = parent.layer(j); break; }
        return l;
    }
    function buildPaint(comp, pa, W, H, ctx, name) {
        var made = null, blend = pa.blend && BLEND[pa.blend] ? BlendingMode[BLEND[pa.blend]] : null;
        if (pa.type === "solid") {
            made = solidIn(comp, pa.color, name + " · cor", W, H, ctx);
        } else if (pa.type === "linear" || pa.type === "radial") {
            var lbl = name + " · " + (pa.type === "linear" ? "gradiente linear" : "gradiente radial");
            var colorLayers = gradientLayers(comp, pa, W, H, "color", ctx, lbl);
            var g = colorLayers.length > 1 ? precompOf(comp, colorLayers, lbl, ctx) : colorLayers[0];
            var needAlpha = false; for (var i = 0; i < pa.stops.length; i++) if (pa.stops[i].alpha < 0.999) needAlpha = true;
            if (needAlpha && g) {
                // transparência das paradas: mesma geometria em tons de cinza como luma matte
                var aLayers = gradientLayers(comp, pa, W, H, "alpha", ctx, lbl + " · alfa");
                var a = aLayers.length > 1 ? precompOf(comp, aLayers, lbl + " · alfa", ctx) : aLayers[0];
                a.moveBefore(g);
                try { g.setTrackMatte(a, TrackMatteType.LUMA); } catch (e) { g.trackMatteType = TrackMatteType.LUMA; }
                try { a.enabled = false; } catch (e) {}
            }
            made = g;
        } else if (pa.type === "image") {
            var item = ctx.importAsset(pa.file), l = comp.layers.add(item), t = tr(l);
            l.name = name + " · imagem";
            var iw = item.width, ih = item.height;
            if (pa.mode === "RASTER") { t.property("ADBE Anchor Point").setValue([0, 0]); t.property("ADBE Position").setValue([0, 0]); t.property("ADBE Scale").setValue([100 / (pa.scale || 1), 100 / (pa.scale || 1)]); }
            else if (pa.mode === "CROP" && pa.imageTransform) {
                var T = pa.imageTransform, det = T.a * T.d - T.b * T.c || 1e-9;
                var I = { a: T.d / det, c: -T.c / det, b: -T.b / det, d: T.a / det, tx: (T.c * T.ty - T.d * T.tx) / det, ty: (T.b * T.tx - T.a * T.ty) / det };
                var M = { a: W * I.a / iw, c: W * I.c / ih, tx: W * I.tx, b: H * I.b / iw, d: H * I.d / ih, ty: H * I.ty };
                applyXf(l, M, 1);
            } else if (pa.mode === "TILE") {
                var sf = pa.scalingFactor || 1, tw = iw * sf, th = ih * sf;
                t.property("ADBE Anchor Point").setValue([0, 0]); t.property("ADBE Position").setValue([0, 0]); t.property("ADBE Scale").setValue([sf * 100, sf * 100]);
                var kx = 2 * Math.ceil(W / tw) + 1, ky = 2 * Math.ceil(H / th) + 1;
                var mt = l.property("ADBE Effect Parade").addProperty("ADBE Tile");
                setByMatch(mt, "ADBE Tile-0001", [iw / 2, ih / 2]);
                setByMatch(mt, "ADBE Tile-0002", 100); setByMatch(mt, "ADBE Tile-0003", 100);
                setByMatch(mt, "ADBE Tile-0004", kx * 100); setByMatch(mt, "ADBE Tile-0005", ky * 100);
            } else {
                var rot = ((pa.rotation || 0) % 360 + 360) % 360, sw = (rot === 90 || rot === 270);
                var ew = sw ? ih : iw, eh = sw ? iw : ih;
                var sc = pa.mode === "FIT" ? Math.min(W / ew, H / eh) : Math.max(W / ew, H / eh);
                t.property("ADBE Anchor Point").setValue([iw / 2, ih / 2]); t.property("ADBE Position").setValue([W / 2, H / 2]);
                t.property("ADBE Scale").setValue([sc * 100, sc * 100]);
                if (rot) t.property("ADBE Rotate Z").setValue(rot);
            }
            made = l;
        }
        if (made) {
            if (pa.alpha !== undefined && pa.alpha < 0.999) tr(made).property("ADBE Opacity").setValue(pa.alpha * 100);
            if (blend) { try { made.blendingMode = blend; } catch (e) {} }
        }
        return made;
    }
    function shapeMatte(comp, spec, dx, dy) {
        var m = comp.layers.addShape();
        var contents = m.property("ADBE Root Vectors Group"), g = contents.addProperty("ADBE Vector Group"), v = g.property("ADBE Vectors Group");
        if (spec.prim === "ellipse") {
            var e = v.addProperty("ADBE Vector Shape - Ellipse"); e.property("ADBE Vector Ellipse Size").setValue([spec.w, spec.h]); e.property("ADBE Vector Ellipse Position").setValue([spec.w / 2 + dx, spec.h / 2 + dy]);
        } else if (spec.prim === "path") {
            each(spec.fillGeometry || [], function (gm) { each(parsePath(gm.data), function (sp) { v.addProperty("ADBE Vector Shape - Group").property("ADBE Vector Shape").setValue(toShape(sp, dx, dy)); }); });
        } else {
            var r = v.addProperty("ADBE Vector Shape - Rect"); r.property("ADBE Vector Rect Size").setValue([spec.w, spec.h]); r.property("ADBE Vector Rect Position").setValue([spec.w / 2 + dx, spec.h / 2 + dy]);
            if (spec.radius) r.property("ADBE Vector Rect Roundness").setValue(Math.min(spec.radius, Math.min(spec.w, spec.h) / 2));
        }
        var f = v.addProperty("ADBE Vector Graphic - Fill"); f.property("ADBE Vector Fill Color").setValue([1, 1, 1, 1]);
        return m;
    }
    function buildPaintStack(comp, spec, ctx) {
        var pad = spec.pad || 0, W = Math.max(1, spec.w), H = Math.max(1, spec.h);
        var name = spec.name || "Preenchimento";
        // comp interno com as camadas de preenchimento (do tamanho do elemento: já recorta retângulos)
        var inner = app.project.items.addComp(uniqueCompName(ctx.fPre, name + " · preenchimentos"), clamp(Math.ceil(W), 4, 30000), clamp(Math.ceil(H), 4, 30000), 1, comp.duration, comp.frameRate);
        inner.parentFolder = ctx.fPre; ctx.precomps++;
        for (var i = 0; i < spec.paints.length; i++) { try { buildPaint(inner, spec.paints[i], W, H, ctx, name); } catch (e) { ctx.notes.push(name + ": preenchimento " + (i + 1) + " não recriado (" + e.message + ")"); } }
        var needMatte = spec.prim === "ellipse" || spec.prim === "path" || (spec.prim === "rect" && spec.radius > 0);
        var hasStroke = (spec.strokeGeometry && spec.strokeGeometry.length && spec.strokeFill) || (spec.strokes && spec.strokes.length);
        if (!needMatte && !hasStroke) {
            var only = comp.layers.add(inner); applyXf(only, spec.xf, 1); return only;
        }
        // comp externo: preenchimentos com a forma como track matte + contorno por cima
        var outer = app.project.items.addComp(uniqueCompName(ctx.fPre, name), clamp(Math.ceil(W + pad * 2), 4, 30000), clamp(Math.ceil(H + pad * 2), 4, 30000), 1, comp.duration, comp.frameRate);
        outer.parentFolder = ctx.fPre; ctx.precomps++;
        var il = outer.layers.add(inner); tr(il).property("ADBE Anchor Point").setValue([0, 0]); tr(il).property("ADBE Position").setValue([pad, pad]);
        if (needMatte) {
            var mt = shapeMatte(outer, spec, pad, pad); mt.name = name + " · forma"; mt.moveBefore(il);
            try { il.setTrackMatte(mt, TrackMatteType.ALPHA); } catch (e) { il.trackMatteType = TrackMatteType.ALPHA; }
            try { mt.enabled = false; } catch (e) {}
        }
        if (hasStroke) {
            var sl = outer.layers.addShape(); sl.name = name + " · contorno";
            if (spec.strokes && spec.strokes.length) addStrokeGroup(sl.property("ADBE Root Vectors Group"), spec, pad, pad);
            else { var sg = addPathGroup(sl.property("ADBE Root Vectors Group"), "Contorno", spec.strokeGeometry, pad, pad); addFill(sg.vectors, spec.strokeFill, 1); }
        }
        var ol = comp.layers.add(outer); applyXf(ol, spec.xf, 1);
        if (pad) tr(ol).property("ADBE Anchor Point").setValue([pad, pad]);
        return ol;
    }
    function buildLayer(comp, spec, ctx) {
        var layer;
        try {
            if (spec.kind === "group") { layer = buildGroup(comp, spec, ctx); ctx.layers++; return layer; }
            if (spec.kind === "shape") layer = buildShape(comp, spec);
            else if (spec.kind === "text") layer = buildText(comp, spec, ctx);
            else if (spec.kind === "image" || spec.kind === "raster") layer = buildFootage(comp, spec, ctx);
            else if (spec.kind === "precomp") layer = buildPrecomp(comp, spec, ctx);
            else if (spec.kind === "paintstack") layer = buildPaintStack(comp, spec, ctx);
            else { ctx.notes.push((spec.name || "?") + ": tipo de camada desconhecido (" + spec.kind + ") — atualize o Figma2AE"); return null; }
            common(layer, spec);
            if (spec.kind === "precomp" && spec.clipRadius > 0) { try { addClipMatte(comp, layer, spec); } catch (e) {} }
            ctx.layers++;
            var notes = [];
            if (spec.reason) notes.push("Imagem: " + spec.reason);
            each(spec.notes || [], function (n) { notes.push(n); });
            if (spec.identity) {
                var idn = spec.identity, st = { NEW: "NOVO neste frame", EXISTING: "igual ao frame anterior", MODIFIED: "MUDOU em relação ao frame anterior" }[idn.status] || idn.state;
                notes.unshift("Figma · " + (idn.status ? st + (idn.diffs && idn.diffs.length ? " (" + idn.diffs.join(", ") + ")" : "") + " · " : "") + "aparece em " + idn.presence.join(", ") + (idn.confidence === "provavel" ? " · correspondência provável" : ""));
                if (idn.status === "NEW") { try { layer.label = 9; } catch (e) {} } else if (idn.status === "MODIFIED") { try { layer.label = 3; } catch (e) {} }
            }
            if (notes.length) { try { layer.comment = notes.join("\n"); } catch (e) {} }
            if (spec.reason) ctx.notes.push((spec.name || "?") + ": virou imagem (" + spec.reason + ")");
        } catch (err) {
            ctx.notes.push((spec.name || "?") + ": erro ao criar (" + err.message + ")");
            return null;
        }
        return layer;
    }

    /* ============================================================ cena e master */
    function buildScene(sc, ctx) {
        var o = ctx.opts;
        var comp = app.project.items.addComp(uniqueCompName(ctx.fComps, sc.compName), clamp(sc.width, 4, 30000), clamp(sc.height, 4, 30000), 1, o.duration, o.fps);
        comp.parentFolder = ctx.fComps;
        comp.comment = "Figma2AE · " + sc.name + " · frames: " + sc.frames.join(" | ");
        if (sc.bg) {
            if (sc.bg.kind === "solid") {
                var s = comp.layers.addSolid([sc.bg.color[0], sc.bg.color[1], sc.bg.color[2]], "Fundo do frame", comp.width, comp.height, 1);
                try { s.source.parentFolder = ctx.fOther; } catch (e) {}
                if (sc.bg.alpha < 0.999) tr(s).property("ADBE Opacity").setValue(sc.bg.alpha * 100);
                s.locked = true;
            } else if (sc.bg.kind === "raster") {
                var bl = buildFootage(comp, { file: sc.bg.file, xf: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }, scale: sc.bg.scale }, ctx);
                bl.name = "Fundo do frame"; bl.locked = true;
            }
        }
        // camadas de baixo pra cima (cada nova entra no topo)
        each(sc.layers, function (spec) {
            var main = buildLayer(comp, spec, ctx);
            if (!main || !spec.altStates || !spec.altStates.length) return;
            if (o.states === "guias") {
                each(spec.altStates, function (alt) {
                    var g = buildLayer(comp, alt, ctx);
                    if (!g) return;
                    g.name = (spec.name || "Camada") + " · estado " + alt.stateLabel;
                    g.guideLayer = true; g.enabled = false; g.label = 11;
                    try { g.comment = "Estado do " + alt.stateLabel + (alt.diffs && alt.diffs.length ? ": " + alt.diffs.join(", ") : "") + ". Camada-guia oculta, só referência pra animar."; } catch (e) {}
                    g.moveAfter(main);
                });
            } else if (o.states === "marcadores") {
                var mk = main.property("ADBE Marker");
                each(spec.altStates, function (alt, k) {
                    var d = decompose(alt.xf);
                    var mv = new MarkerValue("Estado " + alt.stateLabel + ": " + (alt.diffs && alt.diffs.length ? alt.diffs.join(", ") : "diferente") +
                        " | x " + Math.round(alt.xf.tx) + " y " + Math.round(alt.xf.ty) + " rot " + Math.round(d.rot) + "° opac " + Math.round((alt.opacity === undefined ? 1 : alt.opacity) * 100) + "%");
                    mk.setValueAtTime(k * comp.frameDuration * 2, mv);
                });
            }
        });
        return comp;
    }
    function buildFrameComp(c, ctx) {
        var o = ctx.opts;
        var folder = c.group ? ensureFolder(c.group, ctx.fComps) : ctx.fComps;
        var comp = app.project.items.addComp(uniqueCompName(folder, c.compName), clamp(c.width, 4, 30000), clamp(c.height, 4, 30000), 1, o.duration, o.fps);
        comp.parentFolder = folder;
        comp.comment = "Figma2AE · " + (c.sceneName ? c.sceneName + " · " : "") + "frame “" + c.frameName + "”" + (c.partial ? " (só os objetos selecionados)" : "");
        if (c.bg && c.bg.kind === "solid") {
            var s = comp.layers.addSolid([c.bg.color[0], c.bg.color[1], c.bg.color[2]], (c.frameName || "Frame") + " · fundo", comp.width, comp.height, 1);
            try { s.source.parentFolder = ctx.fOther; } catch (e) {}
            s.locked = true;
        }
        each(c.layers, function (spec) { buildLayer(comp, spec, ctx); });
        if (c.ref) {
            try {
                var rl = buildFootage(comp, { file: c.ref.file, xf: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }, scale: c.ref.scale }, ctx);
                rl.name = "REFERÊNCIA FIGMA (guia)"; rl.guideLayer = true; rl.enabled = false; rl.label = 0;
                tr(rl).property("ADBE Opacity").setValue(50);
                rl.comment = "Imagem do frame no Figma. Ligue o olho pra comparar; é camada-guia, não sai no render.";
                rl.moveToBeginning(); rl.locked = true;
            } catch (e) { ctx.notes.push("referência: " + e.message); }
        }
        return comp;
    }
    function buildMaster(comps, ctx) {
        if (!comps.length) return null;
        var o = ctx.opts, total = 0;
        each(comps, function (c) { total += c.duration; });
        var m = app.project.items.addComp(uniqueCompName(ctx.fMaster, "MASTER_COMPOSITION"), comps[0].width, comps[0].height, 1, total, o.fps);
        m.parentFolder = ctx.fMaster;
        var t = 0;
        each(comps, function (c) { var l = m.layers.add(c); l.startTime = t; t += c.duration; });
        return m;
    }

    /* ---------- tomadas (montadas pelo Figma2AE Studio): uma comp por tomada, camadas no tempo de cada frame ---------- */
    function trimNew(comp, before, t0, t1) {
        var added = comp.numLayers - before;
        for (var j = 1; j <= added; j++) {
            var L = comp.layer(j);
            try { L.inPoint = t0; L.outPoint = t1; } catch (e) {}
        }
    }
    function buildShotComp(sh, ctx) {
        var o = ctx.opts, dur = Math.max(1 / o.fps, sh.duration);
        var folder = sh.group ? ensureFolder(sh.group, ctx.fComps) : ctx.fComps;
        var comp = app.project.items.addComp(uniqueCompName(folder, sh.compName), clamp(sh.width, 4, 30000), clamp(sh.height, 4, 30000), 1, dur, o.fps);
        comp.parentFolder = folder;
        comp.comment = "Figma2AE Studio · tomada com " + sh.frameNames.length + " frame(s): " + sh.frameNames.join(" | ");
        var i, before;
        each(sh.bgs || [], function (b) {
            if (!b.bg || b.bg.kind !== "solid") return;
            var sl = comp.layers.addSolid([b.bg.color[0], b.bg.color[1], b.bg.color[2]], "Fundo do frame", comp.width, comp.height, 1);
            try { sl.source.parentFolder = ctx.fOther; } catch (e) {}
            try { sl.inPoint = b.t0; sl.outPoint = b.t1; } catch (e) {}
            sl.locked = true;
        });
        for (i = 0; i < sh.items.length; i++) {
            var it = sh.items[i];
            before = comp.numLayers;
            buildLayer(comp, it.spec, ctx);
            trimNew(comp, before, it.t0, it.t1);
        }
        each(sh.refs || [], function (r) {
            try {
                before = comp.numLayers;
                var rl = buildFootage(comp, { file: r.file, xf: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }, scale: r.scale }, ctx);
                rl.name = "REFERÊNCIA FIGMA " + r.label + " (guia)"; rl.guideLayer = true; rl.enabled = false; rl.label = 0;
                tr(rl).property("ADBE Opacity").setValue(50);
                trimNew(comp, before, r.t0, r.t1);
                rl.moveToBeginning(); rl.locked = true;
            } catch (e) { ctx.notes.push("referência " + r.label + ": " + e.message); }
        });
        // marcadores de cada frame na comp
        each(sh.markers || [], function (m) {
            try { comp.markerProperty.setValueAtTime(m.t, new MarkerValue(m.label)); } catch (e) {}
        });
        return comp;
    }
    function buildPlan(planFile, opts, log) {
        var plan = parseJSON(readText(planFile));
        if (plan.format !== "figma2ae-plan") throw new Error("Esse arquivo não é um plano do Figma2AE Studio.");
        var dir = planFile.parent;
        app.beginUndoGroup("Figma2AE Studio: montar " + plan.shots.length + " tomada(s)");
        try { app.beginSuppressDialogs(); } catch (e) {}
        var ctx, comps = [], master = null;
        try {
            ctx = new Ctx({ file: plan.file }, dir, opts);
            each(plan.shots, function (sh, i) { log("Montando " + sh.compName + " (" + (i + 1) + "/" + plan.shots.length + ")…"); comps.push(buildShotComp(sh, ctx)); });
            if (plan.master && comps.length) {
                var total = 0; each(comps, function (c) { total += c.duration; });
                master = app.project.items.addComp(uniqueCompName(ctx.fMaster, plan.masterName || "MASTER_SEQUENCIA"), comps[0].width, comps[0].height, 1, Math.max(total, 1 / opts.fps), opts.fps);
                master.parentFolder = ctx.fMaster;
                var t = 0;
                each(comps, function (c) { var l = master.layers.add(c); l.startTime = t; try { master.markerProperty.setValueAtTime(t, new MarkerValue(c.name)); } catch (e) {} t += c.duration; });
            }
            var show = opts.openAfter ? (master || comps[0]) : null;
            if (show) { try { show.openInViewer(); } catch (e) {} }
        } finally { try { app.endSuppressDialogs(false); } catch (e) {} app.endUndoGroup(); }
        var fonts = []; for (var f in ctx.missingFonts) fonts.push(f);
        var all = comps.slice(); if (master) all.push(master);
        return { comps: comps.length, compItems: all, layers: ctx.layers, precomps: ctx.precomps, notes: ctx.notes, fonts: fonts, dir: dir.fsName };
    }

    function importPackage(zipFile, opts, log) {
        var dir, jsonFile = null;
        if (/\.json$/i.test(zipFile.name)) {
            dir = zipFile.parent; jsonFile = zipFile; // pacote já extraído: lê direto, não precisa de permissão de gravação
        } else {
            if (!canWriteFiles()) throw new Error("Pra abrir o .zip direto, ative em Editar > Preferências > Scripting e Expressões a opção \"Permitir que scripts gravem arquivos e acessem a rede\".\n\nAlternativa sem mexer em preferência: extraia o .zip (botão direito > Extrair tudo) e escolha o arquivo figma2ae.json de dentro da pasta.");
            log("Extraindo o pacote…");
            dir = unzip(zipFile);
        }
        var pkg = parseJSON(readText(jsonFile || new File(dir.fsName + "/figma2ae.json")));
        if (pkg.format !== "figma2ae") throw new Error("Esse arquivo não é um pacote do Figma2AE.");
        app.beginUndoGroup("Figma2AE: importar " + (pkg.file || ""));
        try { app.beginSuppressDialogs(); } catch (e) {}
        var ctx, comps = [];
        try {
            ctx = new Ctx(pkg, dir, opts);
            if (pkg.comps) each(pkg.comps, function (c, i) { log("Montando " + c.compName + " (" + (i + 1) + "/" + pkg.comps.length + ")…"); comps.push(buildFrameComp(c, ctx)); });
            else each(pkg.scenes, function (sc, i) { log("Montando " + sc.compName + " (" + (i + 1) + "/" + pkg.scenes.length + ")…"); comps.push(buildScene(sc, ctx)); });
            // "Juntar numa comp só": frames do mesmo contêiner viram UMA comp no tamanho do frame,
            // um depois do outro no tempo (nunca a comp gigante lado a lado)
            var seqs = [], inSeq = {};
            if (pkg.sequences) each(pkg.sequences, function (sq) {
                var mem = []; each(sq.comps || [], function (ix) { if (comps[ix]) { mem.push(comps[ix]); inSeq[ix] = true; } });
                if (!mem.length) return;
                log("Juntando " + mem.length + " frame(s) em " + sq.name + "…");
                var total = 0; each(mem, function (c) { total += c.duration; });
                var sc = app.project.items.addComp(uniqueCompName(ctx.fComps, sq.name || "SEQUENCIA"), mem[0].width, mem[0].height, 1, Math.max(total, 1 / opts.fps), opts.fps);
                sc.parentFolder = ctx.fComps;
                var sub = ensureFolder(sc.name + "_FRAMES", ctx.fComps), t = 0;
                each(mem, function (c) {
                    c.parentFolder = sub;
                    var l = sc.layers.add(c); l.startTime = t; l.moveToEnd();
                    try { sc.markerProperty.setValueAtTime(t, new MarkerValue(c.name)); } catch (e) {}
                    t += c.duration;
                });
                seqs.push(sc);
            });
            var tops = []; each(comps, function (c, i) { if (!inSeq[i]) tops.push(c); });
            tops = seqs.concat(tops);
            var master = opts.master && tops.length > 1 ? buildMaster(tops, ctx) : null;
            var show = opts.openAfter ? (master || seqs[0] || comps[0]) : null;
            if (show) { try { show.openInViewer(); } catch (e) {} }
        } finally { try { app.endSuppressDialogs(false); } catch (e) {} app.endUndoGroup(); }
        var fonts = []; for (var f in ctx.missingFonts) fonts.push(f);
        return { comps: comps.length, sequences: seqs.length, nulls: ctx.nulls || 0, compItems: comps.concat(seqs), layers: ctx.layers, precomps: ctx.precomps, notes: ctx.notes, fonts: fonts, dir: dir.fsName };
    }

    /* ============================================================ painel */
    function buildUI(thisObj) {
        var w = (thisObj instanceof Panel) ? thisObj : new Window("palette", "Figma2AE", undefined, { resizeable: true });
        w.orientation = "column"; w.alignChildren = ["fill", "top"]; w.spacing = 8; w.margins = 12;
        var head = w.add("statictext", undefined, "Figma2AE  ·  storyboard do Figma → After Effects"); head.graphics.font = ScriptUI.newFont(head.graphics.font.name, "BOLD", 13);
        var btn = w.add("button", undefined, "Importar pacote (.f2ae.zip)…"); btn.preferredSize.height = 34;

        var p = w.add("panel", undefined, "Opções"); p.alignChildren = ["fill", "top"]; p.margins = [10, 14, 10, 10]; p.spacing = 6;
        var g1 = p.add("group"); g1.add("statictext", undefined, "Frame rate:");
        var FPS = ["23.976", "24", "25", "29.97", "30", "50", "60"];
        var fps = g1.add("dropdownlist", undefined, FPS); fps.selection = Math.max(0, idx(FPS, getSetting("fps", "30")));
        g1.add("statictext", undefined, "  Duração por cena (s):");
        var dur = g1.add("edittext", undefined, getSetting("dur", "5")); dur.characters = 4;
        var STV = ["guias", "marcadores", "nenhum"], st = { selection: { index: 0 } };
        var cbM = p.add("checkbox", undefined, "Ao importar vários frames, criar MASTER_COMPOSITION com eles em sequência"); cbM.value = getSetting("master", "false") === "true";
        var cbO = p.add("checkbox", undefined, "Abrir a composição no final"); cbO.value = getSetting("open", "true") === "true";

        var out = w.add("edittext", undefined, "1. No Figma, selecione um frame, vários frames, a cena inteira ou objetos e clique em Exportar no plugin Figma2AE.\n2. Aqui, clique em Importar pacote. Cada frame vira um comp separado; importar de novo cria comps novos sem mexer nos que já existem.\n\nA camada “REFERÊNCIA FIGMA (guia)” no topo de cada comp é a imagem do Figma: ligue o olho pra comparar.", { multiline: true, readonly: true, scrollable: true });
        out.preferredSize = [380, 170]; out.alignment = ["fill", "fill"];
        var ver = w.add("statictext", undefined, "v" + VERSION); ver.alignment = ["right", "bottom"];

        function log(t) { out.text = t; try { w.update && w.update(); } catch (e) {} }
        btn.onClick = function () {
            var file = File.openDialog("Escolha o pacote exportado pelo Figma2AE", IS_WIN ? "Pacote Figma2AE:*.zip;*.json" : function (x) { return x instanceof Folder || /\.(zip|json)$/i.test(x.name); }, false);
            if (!file) return;
            setSetting("lastDir", file.parent.fsName);
            var opts = { fps: num(fps.selection.text, 30), duration: Math.max(0.1, num(dur.text, 5)), states: "guias", master: cbM.value, openAfter: cbO.value };
            setSetting("fps", fps.selection.text); setSetting("dur", opts.duration); setSetting("master", cbM.value); setSetting("open", cbO.value);
            try {
                var r = importPackage(file, opts, log);
                var msg = "Pronto: " + r.comps + " comp(s), " + r.layers + " camadas, " + r.precomps + " precomps.\nAssets em: " + r.dir;
                if (r.fonts.length) msg += "\n\nFontes não encontradas (o AE trocou por outra): " + r.fonts.join(", ") + ".\nInstale-as e reimporte para o texto ficar idêntico.";
                if (r.notes.length) msg += "\n\nAvisos (" + r.notes.length + "):\n• " + r.notes.slice(0, 60).join("\n• ");
                log(msg);
            } catch (e) {
                log("Erro: " + e.message);
                alert("Figma2AE\n\n" + e.message);
            }
        };
        w.layout.layout(true);
        w.onResizing = w.onResize = function () { this.layout.resize(); };
        if (w instanceof Window) { w.center(); w.show(); }
        return w;
    }

    // expõe funções puras pra testes fora do AE
    if (typeof F2AE_TEST !== "undefined") { F2AE_TEST.parsePath = parsePath; F2AE_TEST.decompose = decompose; return; }
    // usado pela extensão (painel HTML): só expõe a função, sem montar a janela ScriptUI
    if (typeof F2AE_HOST !== "undefined") { F2AE_HOST.importPackage = importPackage; F2AE_HOST.buildPlan = buildPlan; F2AE_HOST.version = VERSION; return; }
    // execução automatizada (testes): F2AE_RUN = { file: "...", out: "...", opts: {...} }
    if (typeof F2AE_RUN !== "undefined") {
        var res;
        try {
            var t0 = new Date().getTime();
            var r0 = importPackage(new File(F2AE_RUN.file), F2AE_RUN.opts || { fps: 30, duration: 5, states: "guias", master: false, openAfter: false }, function () {});
            res = "OK comps=" + r0.comps + " layers=" + r0.layers + " precomps=" + r0.precomps + " tempo=" + ((new Date().getTime() - t0) / 1000) + "s fonts=" + r0.fonts.join("|") + " notes=" + r0.notes.length + "\n" + r0.notes.slice(0, 40).join("\n");
            if (F2AE_RUN.render) each(r0.compItems, function (c) {
                var pf = new File(F2AE_RUN.render + "/render_" + c.name + ".png");
                try { c.saveFrameToPng(0, pf); var w = 0; while (!pf.exists && w < 40) { $.sleep(250); w++; } res += "\nrender " + c.name + (pf.exists ? " ok" : " FALHOU"); } catch (e) { res += "\nrender " + c.name + " erro " + e.message; }
            });
        }
        catch (e) { res = "ERRO " + e.message + " linha " + e.line; }
        if (F2AE_RUN.out) try { var fo = new File(F2AE_RUN.out); fo.encoding = "UTF-8"; fo.open("w"); fo.write(res); fo.close(); } catch (e2) {}
        F2AE_RUN.result = res;
        return;
    }
    buildUI(thisObj);
})(this);
