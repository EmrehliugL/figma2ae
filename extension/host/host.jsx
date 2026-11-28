/* Ponte entre o painel HTML do Figma2AE e o After Effects */
var F2AE_HOST = F2AE_HOST || {};
function f2aeLoad(extDir) {
    // carrega a biblioteca do Figma2AE (chamado pelo painel com o caminho absoluto da extensão)
    F2AE_HOST.loadError = "";
    try {
        var dir = extDir || File($.fileName).parent.parent.fsName;
        F2AE_HOST.dir = dir;
        var f = new File(dir + "/jsx/Figma2AE.jsx");
        if (!f.exists) { F2AE_HOST.loadError = "arquivo não encontrado: " + f.fsName; return f2aePing(); }
        $.evalFile(f);
    } catch (e) { F2AE_HOST.loadError = e.message + " (linha " + e.line + ")"; }
    return f2aePing();
}
try { if (!F2AE_HOST.importPackage) f2aeLoad(); } catch (e) {}

// escapa TUDO que quebraria o JSON (tab, \r, caracteres de controle colados no nome de uma camada…):
// antes só a quebra de linha, e um tab no nome fazia o plugin dizer "o After não respondeu" mesmo com a importação certa
function f2aeEsc(s) {
    return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\u0000-\u001f\u2028\u2029]/g, function (c) {
        var h = c.charCodeAt(0).toString(16); return "\\u" + ("0000" + h).slice(-4);
    });
}
function f2aeArr(a) { var o = []; for (var i = 0; i < a.length; i++) o.push('"' + f2aeEsc(a[i]) + '"'); return "[" + o.join(",") + "]"; }

function f2aePing() {
    var name = "";
    try { name = app.project && app.project.file ? File.decode(app.project.file.name) : "Projeto sem título"; } catch (e) {}
    return '{"ok":' + (F2AE_HOST.importPackage ? "true" : "false") + ',"version":"' + f2aeEsc(F2AE_HOST.version || "?") + '","project":"' + f2aeEsc(name) + '","error":"' + f2aeEsc(F2AE_HOST.loadError || "") + '"}';
}

function f2aeImport(jsonPath, opts) {
    try {
        // recarrega a biblioteca a cada importação: atualizações do Figma2AE valem sem reabrir o After Effects
        try { if (F2AE_HOST.dir) { var lib = new File(F2AE_HOST.dir + "/jsx/Figma2AE.jsx"); if (lib.exists) $.evalFile(lib); } } catch (eR) {}
        if (!F2AE_HOST.importPackage) return '{"ok":false,"error":"' + f2aeEsc("Script do Figma2AE não carregou: " + (F2AE_HOST.loadError || "?")) + '"}';
        var t0 = new Date().getTime();
        var r = F2AE_HOST.importPackage(new File(jsonPath), opts, function () {});
        var names = [];
        for (var i = 0; i < r.compItems.length; i++) names.push(r.compItems[i].name);
        return '{"ok":true,"comps":' + r.comps + ',"sequences":' + (r.sequences || 0) + ',"nulls":' + (r.nulls || 0) + ',"layers":' + r.layers + ',"precomps":' + r.precomps + ',"seconds":' + ((new Date().getTime() - t0) / 1000) +
            ',"fonts":' + f2aeArr(r.fonts) + ',"notes":' + f2aeArr(r.notes.slice(0, 80)) + ',"names":' + f2aeArr(names) + '}';
    } catch (e) {
        return '{"ok":false,"error":"' + f2aeEsc(e.message + (e.line ? " (linha " + e.line + ")" : "")) + '"}';
    }
}

function f2aeReveal(name) {
    // seleciona e abre um comp pelo nome
    try {
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof CompItem && it.name === name) { it.openInViewer(); return "ok"; }
        }
    } catch (e) { return "erro " + e.message; }
    return "nao achei";
}

function f2aeBuildPlan(planPath, opts) {
    try {
        try { if (F2AE_HOST.dir) { var lib = new File(F2AE_HOST.dir + "/jsx/Figma2AE.jsx"); if (lib.exists) $.evalFile(lib); } } catch (eR) {}
        if (!F2AE_HOST.buildPlan) return '{"ok":false,"error":"' + f2aeEsc("Script do Figma2AE desatualizado ou não carregou: " + (F2AE_HOST.loadError || "?")) + '"}';
        var t0 = new Date().getTime();
        var r = F2AE_HOST.buildPlan(new File(planPath), opts, function () {});
        var names = [];
        for (var i = 0; i < r.compItems.length; i++) names.push(r.compItems[i].name);
        return '{"ok":true,"comps":' + r.comps + ',"sequences":' + (r.sequences || 0) + ',"nulls":' + (r.nulls || 0) + ',"layers":' + r.layers + ',"seconds":' + ((new Date().getTime() - t0) / 1000) +
            ',"fonts":' + f2aeArr(r.fonts) + ',"notes":' + f2aeArr(r.notes.slice(0, 80)) + ',"names":' + f2aeArr(names) + '}';
    } catch (e) {
        return '{"ok":false,"error":"' + f2aeEsc(e.message + (e.line ? " (linha " + e.line + ")" : "")) + '"}';
    }
}

function f2aeQuick(jsonPath) {
    // Quick Import: camadas soltas na comp aberta
    try {
        try { if (F2AE_HOST.dir) { var lib = new File(F2AE_HOST.dir + "/jsx/Figma2AE.jsx"); if (lib.exists) $.evalFile(lib); } } catch (eR) {}
        if (!F2AE_HOST.quickImport) return '{"ok":false,"error":"' + f2aeEsc("Script do Figma2AE desatualizado: atualize o Figma2AE e reinicie o After Effects.") + '"}';
        var r = F2AE_HOST.quickImport(new File(jsonPath));
        return '{"ok":true,"layers":' + r.layers + ',"comp":"' + f2aeEsc(r.comp) + '","created":' + (r.created ? "true" : "false") + ',"place":"' + f2aeEsc(r.place || "") + '","fonts":' + f2aeArr(r.fonts) + ',"notes":' + f2aeArr(r.notes.slice(0, 40)) + '}';
    } catch (e) {
        return '{"ok":false,"error":"' + f2aeEsc(e.message + (e.line ? " (linha " + e.line + ")" : "")) + '"}';
    }
}
