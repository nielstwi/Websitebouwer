#!/usr/bin/env python3
"""Meta Ads analyse: haalt data op via de (gratis) Marketing API en maakt een HTML-rapport + CSV.

Alleen Python-standaardbibliotheek, geen betaalde diensten.

Gebruik:
  python3 analyse.py --demo                 # voorbeelddata, geen token nodig
  python3 analyse.py --days 30              # echte data (zie README voor token)
"""
import argparse, csv, html, json, os, random, sys, urllib.parse, urllib.request
from collections import defaultdict
from datetime import date, timedelta

API = "https://graph.facebook.com/v21.0"
FIELDS = ("campaign_name,adset_name,ad_id,ad_name,spend,impressions,reach,clicks,"
          "inline_link_clicks,actions,action_values")


# ---------- data ophalen ----------
def fetch(account, token, since, until):
    q = urllib.parse.urlencode({
        "access_token": token, "level": "ad", "fields": FIELDS, "time_increment": 1,
        "time_range": json.dumps({"since": since, "until": until}), "limit": 500})
    url, rows = f"{API}/act_{account.removeprefix('act_')}/insights?{q}", []
    while url:
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                data = json.load(r)
        except urllib.error.HTTPError as e:
            sys.exit(f"Meta API fout {e.code}: {e.read().decode()[:400]}")
        rows += data.get("data", [])
        url = data.get("paging", {}).get("next")
    return [normalise(r) for r in rows]


def action(r, key, name="purchase"):
    for a in r.get(key) or []:
        if a["action_type"] in (name, f"omni_{name}"):
            return float(a["value"])
    return 0.0


def normalise(r):
    return {
        "date": r["date_start"], "campaign": r.get("campaign_name", ""),
        "adset": r.get("adset_name", ""), "ad": r.get("ad_name", ""),
        "spend": float(r.get("spend", 0)), "impressions": int(r.get("impressions", 0)),
        "reach": int(r.get("reach", 0)), "clicks": int(r.get("inline_link_clicks") or r.get("clicks", 0)),
        "purchases": action(r, "actions"), "revenue": action(r, "action_values"),
    }


def demo_rows(days):
    rnd, rows = random.Random(7), []
    ads = [("Zijden Maskers", "Lookalike NL", "UGC review", 1.0), ("Zijden Maskers", "Lookalike NL", "Productshot", 0.5),
           ("Zijden Maskers", "Breed AU", "Reel slaap", 1.6), ("Scrunchies", "Interesse", "Carousel", 0.3),
           ("Scrunchies", "Retargeting", "Korting 10%", 2.4), ("Kussenslopen", "Breed AU", "Voor/na", 0.9)]
    for i in range(days):
        d = (date.today() - timedelta(days=days - i)).isoformat()
        for camp, adset, ad, q in ads:
            spend = rnd.uniform(6, 18)
            imp = int(spend / rnd.uniform(0.008, 0.016))
            clicks = int(imp * rnd.uniform(0.008, 0.022) * (0.6 + q / 2))
            p = sum(rnd.random() < 0.035 * q for _ in range(clicks // 4 + 1))
            rows.append({"date": d, "campaign": camp, "adset": adset, "ad": ad, "spend": spend,
                         "impressions": imp, "reach": int(imp / rnd.uniform(1.1, 1.7)),
                         "clicks": clicks, "purchases": p, "revenue": p * rnd.uniform(60, 90)})
    return rows


# ---------- analyse ----------
def div(a, b):
    return a / b if b else 0.0


def aggregate(rows, keys):
    g = defaultdict(lambda: defaultdict(float))
    for r in rows:
        k = tuple(r[x] for x in keys)
        for m in ("spend", "impressions", "reach", "clicks", "purchases", "revenue"):
            g[k][m] += r[m]
    out = []
    for k, m in g.items():
        o = dict(zip(keys, k), **m)
        o.update(roas=div(m["revenue"], m["spend"]), cpa=div(m["spend"], m["purchases"]),
                 ctr=div(m["clicks"], m["impressions"]) * 100, cpc=div(m["spend"], m["clicks"]),
                 cpm=div(m["spend"], m["impressions"]) * 1000, frequency=div(m["impressions"], m["reach"]),
                 cvr=div(m["purchases"], m["clicks"]) * 100)
        out.append(o)
    return sorted(out, key=lambda x: -x["spend"])


def verdict(o, a):
    if o["spend"] < a.min_spend:
        return "Te weinig data", "neutral"
    if o["purchases"] == 0 or o["roas"] < a.breakeven:
        return "Stoppen / aanpassen", "bad"
    if o["roas"] >= a.target and o["purchases"] >= 3:
        return ("Schalen (let op frequentie)" if o["frequency"] > a.max_freq else "Schalen"), "good"
    return "Blijven testen", "warn"


# ---------- rapport ----------
CSS = """body{font:14px system-ui,sans-serif;margin:0;background:#f6f5f2;color:#222}main{max-width:1100px;margin:auto;padding:24px 16px}
h1{margin:0 0 4px}h2{margin-top:32px}.sub{color:#666}.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:20px 0}
.kpi{background:#fff;border-radius:10px;padding:14px}.kpi b{display:block;font-size:22px}.kpi span{color:#666;font-size:12px}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden}th,td{padding:8px 10px;text-align:right;border-bottom:1px solid #eee;white-space:nowrap}
th:first-child,td:first-child,th.l,td.l{text-align:left}th{background:#eee;font-size:12px}.wrap{overflow-x:auto}
.good{color:#0a7a3d;font-weight:600}.bad{color:#b3261e;font-weight:600}.warn{color:#9a6700;font-weight:600}.neutral{color:#888}
svg{background:#fff;border-radius:10px;width:100%}"""


def eur(x): return f"€{x:,.2f}"


def table(rows, cols, a, with_verdict=False):
    head = "".join(f"<th class='{'l' if c[2]=='t' else ''}'>{c[1]}</th>" for c in cols) + ("<th class='l'>Advies</th>" if with_verdict else "")
    body = ""
    for r in rows:
        tds = ""
        for key, _, kind in cols:
            v = r[key]
            tds += f"<td class='{'l' if kind=='t' else ''}'>" + (html.escape(str(v)) if kind == "t" else
                   eur(v) if kind == "e" else f"{v:,.0f}" if kind == "i" else f"{v:.2f}") + "</td>"
        if with_verdict:
            t, c = verdict(r, a)
            tds += f"<td class='l {c}'>{t}</td>"
        body += f"<tr>{tds}</tr>"
    return f"<div class='wrap'><table><tr>{head}</tr>{body}</table></div>"


def chart(days):
    if not days: return ""
    w, h, p = 1000, 220, 30
    mx = max(max(d["spend"], d["revenue"]) for d in days) or 1
    def pts(k):
        return " ".join(f"{p+i*(w-2*p)/max(len(days)-1,1):.1f},{h-p-d[k]/mx*(h-2*p):.1f}" for i, d in enumerate(days))
    return (f"<svg viewBox='0 0 {w} {h}'><polyline fill='none' stroke='#0a7a3d' stroke-width='2' points='{pts('revenue')}'/>"
            f"<polyline fill='none' stroke='#b3261e' stroke-width='2' points='{pts('spend')}'/>"
            f"<text x='{p}' y='16' fill='#0a7a3d' font-size='12'>omzet</text><text x='{p+60}' y='16' fill='#b3261e' font-size='12'>uitgaven</text>"
            f"<text x='{w-p}' y='16' text-anchor='end' font-size='12' fill='#666'>max {eur(mx)}/dag</text></svg>")


def report(rows, a, since, until, demo):
    tot = aggregate([dict(r, k="t") for r in rows], ["k"])[0]
    camps, adsets = aggregate(rows, ["campaign"]), aggregate(rows, ["campaign", "adset"])
    ads = aggregate(rows, ["campaign", "adset", "ad"])
    daily = sorted(aggregate(rows, ["date"]), key=lambda x: x["date"])
    num = [("spend", "Uitgaven", "e"), ("revenue", "Omzet", "e"), ("roas", "ROAS", "f"), ("purchases", "Aankopen", "i"),
           ("cpa", "CPA", "e"), ("ctr", "CTR %", "f"), ("cpm", "CPM", "e"), ("frequency", "Freq.", "f"), ("cvr", "CVR %", "f")]
    kpi = lambda l, v: f"<div class='kpi'><b>{v}</b><span>{l}</span></div>"
    alerts = [f"<li><b>{html.escape(o['ad'])}</b> ({html.escape(o['campaign'])}): {t.lower()} – ROAS {o['roas']:.2f}, {eur(o['spend'])} besteed</li>"
              for o in ads for t, c in [verdict(o, a)] if c in ("good", "bad")]
    return f"""<!doctype html><html lang="nl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Meta Ads analyse</title><style>{CSS}</style><main>
<h1>Meta Ads analyse</h1><div class="sub">{since} t/m {until}{' · DEMODATA' if demo else ''} · break-even ROAS {a.breakeven} · doel-ROAS {a.target}</div>
<div class="kpis">{kpi('Uitgaven', eur(tot['spend']))}{kpi('Omzet', eur(tot['revenue']))}{kpi('ROAS', f"{tot['roas']:.2f}")}
{kpi('Aankopen', f"{tot['purchases']:.0f}")}{kpi('CPA', eur(tot['cpa']))}{kpi('CTR', f"{tot['ctr']:.2f}%")}{kpi('CPM', eur(tot['cpm']))}</div>
<h2>Uitgaven vs omzet per dag</h2>{chart(daily)}
<h2>Aanbevelingen</h2><ul>{''.join(alerts) or '<li>Geen duidelijke winnaars of verliezers.</li>'}</ul>
<h2>Campagnes</h2>{table(camps, [("campaign","Campagne","t")]+num, a, True)}
<h2>Adsets</h2>{table(adsets, [("campaign","Campagne","t"),("adset","Adset","t")]+num, a, True)}
<h2>Advertenties</h2>{table(ads, [("campaign","Campagne","t"),("adset","Adset","t"),("ad","Ad","t")]+num, a, True)}
</main></html>"""


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--demo", action="store_true", help="gebruik voorbeelddata")
    p.add_argument("--days", type=int, default=30)
    p.add_argument("--out", default="output")
    p.add_argument("--breakeven", type=float, default=1.5, help="ROAS waaronder je verlies maakt")
    p.add_argument("--target", type=float, default=3.0, help="ROAS vanaf waar je schaalt")
    p.add_argument("--min-spend", type=float, default=30, help="minimale uitgaven voor een oordeel")
    p.add_argument("--max-freq", type=float, default=3.0)
    a = p.parse_args()
    until, since = date.today().isoformat(), (date.today() - timedelta(days=a.days)).isoformat()
    if a.demo:
        rows = demo_rows(a.days)
    else:
        token, acct = os.environ.get("META_ACCESS_TOKEN"), os.environ.get("META_AD_ACCOUNT_ID")
        if not token or not acct:
            sys.exit("Zet META_ACCESS_TOKEN en META_AD_ACCOUNT_ID (zie README), of gebruik --demo.")
        rows = fetch(acct, token, since, until)
    if not rows:
        sys.exit("Geen data gevonden voor deze periode.")
    os.makedirs(a.out, exist_ok=True)
    with open(f"{a.out}/ads.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
    with open(f"{a.out}/rapport.html", "w") as f:
        f.write(report(rows, a, since, until, a.demo))
    print(f"Klaar: {a.out}/rapport.html en {a.out}/ads.csv ({len(rows)} rijen)")


if __name__ == "__main__":
    main()
