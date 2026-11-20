import markdown,sys,re
src,out=sys.argv[1],sys.argv[2]
md=open(src,encoding='utf-8').read()
html=markdown.markdown(md,extensions=['tables','fenced_code'])
css='''body{font-family:"Segoe UI",Arial,sans-serif;max-width:860px;margin:32px auto;padding:0 28px;color:#222;line-height:1.55;font-size:14px}
h1{font-size:26px;border-bottom:3px solid #2d8ceb;padding-bottom:6px;margin-top:38px}h1:first-child{margin-top:0}
h2{font-size:19px;margin-top:28px;color:#1a1a1a}h3{font-size:15.5px;margin-top:20px}
table{border-collapse:collapse;width:100%;margin:10px 0;font-size:13px}th,td{border:1px solid #d6d6d6;padding:6px 9px;text-align:left;vertical-align:top}
th{background:#f1f5fa}code{background:#f2f2f2;padding:1px 5px;border-radius:3px;font-size:12.5px}
pre{background:#f6f6f6;padding:10px 12px;border-radius:5px;overflow:auto;font-size:12px;line-height:1.35}
hr{border:0;border-top:1px solid #ddd;margin:30px 0}strong{color:#111}
@media print{pre,table{page-break-inside:avoid}}'''
open(out,'w',encoding='utf-8').write(f'<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Figma2AE · Tutorial</title><style>{css}</style></head><body>{html}</body></html>')
