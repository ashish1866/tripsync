import { formatRupees } from '../utils/format';
import styles from './BudgetBar.module.css';

// Spent against budget, as a painted strip. Over budget turns road-sign red.
// No budget set: says so instead of drawing an empty bar.
export default function BudgetBar({ spent, budget, compact = false }) {
  if (!budget) {
    return <p className={styles.line}>{spent ? `${formatRupees(spent)} spent. No budget set.` : 'No budget set, nothing spent yet.'}</p>;
  }
  const share = Math.min(spent / budget, 1);
  const over = spent > budget;
  const left = budget - spent;

  return (
    <div className={`${styles.wrap} ${compact ? styles.compact : ''}`}>
      <p className={styles.line}>
        <strong className={styles.amount}>{formatRupees(spent)}</strong> spent of {formatRupees(budget)}.{' '}
        <span className={over ? styles.over : undefined}>{over ? `${formatRupees(-left)} over budget.` : `${formatRupees(left)} left.`}</span>
      </p>
      <div
        className={styles.track}
        role="meter"
        aria-label="Spent of the budget"
        aria-valuemin={0}
        aria-valuemax={budget}
        aria-valuenow={Math.min(spent, budget)}
        aria-valuetext={`${formatRupees(spent)} of ${formatRupees(budget)}`}
      >
        <span className={`${styles.fill} ${over ? styles.fillOver : ''}`} style={{ width: `${share * 100}%` }} />
      </div>
    </div>
  );
}
