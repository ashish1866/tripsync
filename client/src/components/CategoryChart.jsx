import { Bar, BarChart, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { CATEGORIES } from '../utils/money';
import { formatRupees } from '../utils/format';
import styles from './CategoryChart.module.css';

// Spending by category as painted bars, one per category, each in the cap
// colour of a kilometre stone (yellow National Highway, green State Highway...).
// Recharts draws the layout; every visual is ours: bar shape, colours, lettering.
// No tooltip, legend or grid: each bar is labelled with its amount, and the
// same numbers are in a table for screen readers.
// rows: [{ category, spent, bills }] from GET /trips/:id/budget
export default function CategoryChart({ rows }) {
  const byValue = new Map(rows.map((r) => [r.category, r]));
  const data = CATEGORIES.filter((c) => byValue.has(c.value)).map((c) => ({
    ...byValue.get(c.value),
    label: c.label,
    road: c.road,
    amountText: formatRupees(byValue.get(c.value).spent),
  }));
  data.sort((a, b) => b.spent - a.spent);
  const height = data.length * 44 + 8;

  return (
    <figure className={styles.figure}>
      <div className={styles.chart} aria-hidden="true">
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 104, bottom: 4, left: 0 }} barCategoryGap={8}>
            <XAxis type="number" hide domain={[0, 'dataMax']} />
            <YAxis type="category" dataKey="label" width={92} axisLine={false} tickLine={false} tick={<CategoryTick />} />
            <Bar dataKey="spent" isAnimationActive={false} shape={<PaintedBar />}>
              <LabelList dataKey="amountText" content={<AmountLabel />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="visually-hidden">
        <caption>Spending by category</caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Spent</th>
            <th scope="col">Bills</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.category}>
              <th scope="row">{d.label}</th>
              <td>{d.amountText}</td>
              <td>{d.bills}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

// A flat painted bar with the 2px ink outline every board has. A bar for a
// tiny amount is still drawn 4px wide so its colour can be seen.
function PaintedBar({ x, y, width, height, payload }) {
  return <rect x={x} y={y} width={Math.max(width, 4)} height={height} rx={2} className={`${styles.bar} ${styles[payload.road]}`} />;
}

function CategoryTick({ x, y, payload }) {
  return (
    <text x={x - 8} y={y} dy="0.35em" textAnchor="end" className={styles.tick}>
      {payload.value}
    </text>
  );
}

function AmountLabel({ x, y, width, height, value }) {
  return (
    <text x={x + Math.max(width, 4) + 8} y={y + height / 2} dy="0.35em" className={styles.amount}>
      {value}
    </text>
  );
}
