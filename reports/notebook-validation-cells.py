import json, csv, io, statistics

paper_pack = json.loads(r'''{"schemaVersion":"pendulum-paper-pack/v2","currentSnapshot":{"hash":"fixture-hash"},"parameterStudy":{"id":"s1","variable":"theta1","strategy":"grid","count":3},"parameterStudySummary":{"complete":3,"failed":0,"pending":0,"planHash":"h"},"runLog":[]}''')
figure_manifest = json.loads(r'''{"schemaVersion":"pendulum-paper-figures/v2","figureCount":1,"totalBytes":1234,"figures":[{"file":"figures/figure-01-main.png","width":800,"height":500,"dataHash":"fh","caption":"Main trajectory"}]}''')
print('paper pack schema:', paper_pack['schemaVersion'])
print('snapshot hash   :', paper_pack['currentSnapshot']['hash'])
print('figures         :', figure_manifest['figureCount'])


def load_csv(text):
    rows = [line for line in io.StringIO(text) if not line.startswith("#")]
    return list(csv.DictReader(rows))

comparison_rows = load_csv(r'''# schemaVersion=pendulum-comparison-matrix-csv/v1
id,label,source,timestamp,method,system,dt,damping,drift,lambda_max,fps,score,hash
row1,baseline,experiment,2026-01-01T00:00:00Z,rk4,double,0.003,0,1e-9,1.1,60,95,abc''')
print(f'comparison matrix: {len(comparison_rows)} rows')
for row in comparison_rows[:10]:
    print(f"  {row.get('source','?'):14s} {row.get('label','?')[:32]:32s} method={row.get('method','?'):10s} score={row.get('score','?')}")


study_rows = load_csv(r'''# schemaVersion=pendulum-parameter-study-results/v1
point_id,label,variable,value,lambda_max,lambda_block_std_error,rqa_determinism,rqa_divergence,ftle,duration_ms,attempts,error,snapshot_hash
p0,theta1=1.5,theta1,1.5,0.8123,0.0210,0.91,0.04,1.10,900,1,,abc123
p1,theta1=2.0,theta1,2.0,1.2345,0.0190,0.88,0.06,1.31,910,1,,def456
p2,theta1=2.5,theta1,2.5,1.5012,0.0240,0.85,0.07,1.45,905,1,,fed789''')
completed = [r for r in study_rows if r.get('lambda_max')]
print(f'study points: {len(study_rows)} total, {len(completed)} with results')
if completed:
    lambdas = [float(r['lambda_max']) for r in completed]
    print(f'lambda_max: mean={statistics.mean(lambdas):.4f}, min={min(lambdas):.4f}, max={max(lambdas):.4f}')
    chaotic = sum(1 for l in lambdas if l > 0)
    print(f'chaotic fraction: {chaotic}/{len(lambdas)}')


# Lambda vs parameter with block-SE uncertainty bars (matplotlib optional).
try:
    import matplotlib.pyplot as plt
    xs = [float(r["value"]) for r in completed]
    ys = [float(r["lambda_max"]) for r in completed]
    es = [float(r["lambda_block_std_error"] or 0) for r in completed]
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    xs, ys, es = [xs[i] for i in order], [ys[i] for i in order], [es[i] for i in order]
    fig, ax = plt.subplots(figsize=(7, 4))
    ax.errorbar(xs, ys, yerr=es, fmt="o-", capsize=3, linewidth=1)
    ax.axhline(0.0, color="gray", linestyle="--", linewidth=0.8)
    ax.set_xlabel("theta1")
    ax.set_ylabel("lambda_max (Benettin) ± block SE")
    ax.set_title("Maximal Lyapunov exponent vs parameter")
    plt.tight_layout()
    plt.show()
except ImportError:
    print("matplotlib not installed — text summary above stands in for the plot")


# Figure manifest: provenance of every captured figure.
for fig in figure_manifest['figures']:
    print(f"{fig['file']}: {fig['width']}x{fig['height']}, hash {fig['dataHash']}, caption: {fig['caption'][:60]}")
print('total estimated bytes:', figure_manifest['totalBytes'])


# Study / run-log summaries from the paper pack.
study = paper_pack.get('parameterStudy')
if study:
    print(f"study {study['id']}: {study['variable']} ({study['strategy']}), {study['count']} points")
summary = paper_pack.get('parameterStudySummary')
if summary:
    print(f"complete={summary['complete']} failed={summary['failed']} pending={summary['pending']} planHash={summary['planHash']}")
print('run log entries:', len(paper_pack.get('runLog', [])))
