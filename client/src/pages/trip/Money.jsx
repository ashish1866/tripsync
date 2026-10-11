import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router';
import api, { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import BudgetBar from '../../components/BudgetBar';
import CategoryChart from '../../components/CategoryChart';
import ExpenseForm from '../../components/ExpenseForm';
import ConfirmDialog from '../../components/ConfirmDialog';
import Button from '../../components/Button';
import Notice from '../../components/Notice';
import RoadLoader from '../../components/RoadLoader';
import SelectField from '../../components/SelectField';
import { formatDate, formatRupees, plural } from '../../utils/format';
import { CATEGORIES, CATEGORY_LABEL } from '../../utils/money';
import { canPlan } from '../../utils/roles';
import styles from './Money.module.css';

const ROAD = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.road]));

// /trips/:id/money : the ledger. Settle up first (it is what people open this
// for), then the budget by category, then every bill.
export default function Money() {
  const { trip, reload } = useOutletContext();
  const { profile } = useAuth();
  const me = profile.uid;
  const planner = canPlan(trip.myRole);
  // Two independent loads, so a problem with one never hides the other:
  // the summary (settle up + budget) and the list of bills (filtered, 20 to a page).
  const [state, setState] = useState({ status: 'loading' });
  const [list, setList] = useState({ status: 'loading' });
  const [filters, setFilters] = useState({ category: '', person: '' });
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [paying, setPaying] = useState(null);
  const [payBusy, setPayBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [freshId, setFreshId] = useState(null); // the bill or payment just added: wet paint on its row

  const loadSummary = useCallback(async () => {
    try {
      const [budget, settle] = await Promise.all([api.get(`/trips/${trip.id}/budget`), api.get(`/trips/${trip.id}/settlements`)]);
      setState({ status: 'ready', budget: budget.data, settle: settle.data });
    } catch (err) {
      setState({ status: 'error', message: errorMessage(err) });
    }
  }, [trip.id]);

  const loadBills = useCallback(async () => {
    // Keep the bills already on screen while the next page or filter loads.
    setList((l) => (l.status === 'ready' ? { ...l, refreshing: true } : { status: 'loading' }));
    try {
      const params = { page };
      if (filters.category) params.category = filters.category;
      if (filters.person) params.person = filters.person;
      const { data } = await api.get(`/trips/${trip.id}/expenses`, { params });
      // The last bill on a page was deleted: step back to the last page that still exists.
      // `applied` keeps the filters this answer was asked with, so while the next answer loads
      // the screen still describes the old answer correctly (never "No bills yet" for the old
      // empty result seen through the new, cleared filters).
      if (data.page > data.pages) setPage(data.pages);
      else setList({ status: 'ready', data, applied: { category: filters.category, person: filters.person } });
    } catch (err) {
      setList({ status: 'error', message: errorMessage(err) });
    }
  }, [trip.id, page, filters]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadBills();
  }, [loadBills]);

  // Another page or filter: the bill just added is no longer news.
  useEffect(() => {
    setFreshId(null);
  }, [page, filters]);

  // After any change: the summary, the bills on screen, and the trip (its "spent" line).
  const refresh = useCallback(async () => {
    await Promise.all([loadSummary(), loadBills(), reload()]);
  }, [loadSummary, loadBills, reload]);

  const changeFilter = (field) => (event) => {
    setFilters((f) => ({ ...f, [field]: event.target.value }));
    setPage(1);
  };
  const clearFilters = () => {
    setFilters({ category: '', person: '' });
    setPage(1);
  };

  async function confirmDelete() {
    setDeleteBusy(true);
    setProblem(null);
    try {
      await api.delete(`/trips/${trip.id}/expenses/${deleting.id}`);
      await refresh();
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setDeleteBusy(false);
      setDeleting(null);
    }
  }

  async function confirmPaid() {
    setPayBusy(true);
    setProblem(null);
    try {
      const { data } = await api.post(`/trips/${trip.id}/settlements`, paying);
      setFreshId(data.settlement?.id ?? null);
      await refresh();
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setPayBusy(false);
      setPaying(null);
    }
  }

  const summaryReady = state.status === 'ready';
  const { budget, settle } = state;
  const bills = list.status === 'ready' ? list.data : null;
  // Names: the trip's own members first, then anyone only the bills or the balances know.
  const names = {
    ...Object.fromEntries(trip.members.map((m) => [m.uid, m.name])),
    ...(bills?.names ?? {}),
    ...Object.fromEntries((settle?.people ?? []).map((p) => [p.uid, p.name])),
  };
  const nameOf = (uid) => (uid === me ? 'You' : names[uid] || 'A former member');
  const sentenceName = (uid) => (uid === me ? 'you' : names[uid] || 'a former member');
  const expenses = bills?.expenses ?? [];
  const everyBill = bills?.allTotal ?? null; // every bill and payment of the trip, whatever the filters
  const canChange = (e) => trip.myRole === 'owner' || (trip.myRole === 'editor' && e.createdBy === me);
  // What the bills on screen were filtered by (the drop-downs may already show the next choice).
  const shown = list.status === 'ready' ? list.applied : filters;
  const filtered = Boolean(shown.category || shown.person);
  const anyBills = bills ? bills.allTotal > 0 : Boolean(budget?.byCategory.length);

  return (
    <div className={styles.page}>
      {problem && <Notice tone="warning">{problem}</Notice>}

      <div className={styles.top}>
        {state.status === 'loading' && <RoadLoader label="Adding up the bills" />}
        {state.status === 'error' && (
          <div className={styles.problem}>
            <Notice tone="warning" title="Settle up and the budget could not be loaded">
              <p>{state.message} The bills below may still load.</p>
            </Notice>
            <Button variant="plain" onClick={loadSummary}>
              Try loading them again
            </Button>
          </div>
        )}
        {summaryReady && (
          <>
        <section className={styles.settle} aria-labelledby="settle-title">
          <h2 id="settle-title" className={styles.heading}>
            Settle up
          </h2>
          {settle.transfers.length === 0 ? (
            <p className={styles.even}>{anyBills ? 'Everyone is square. Nobody owes anybody.' : 'Nothing to settle yet. Add the first bill and this shows who pays whom.'}</p>
          ) : (
            <>
              <p className={styles.lead}>The shortest list of payments that squares everyone up.</p>
              <ol className={styles.transfers} aria-label="Who pays whom">
                {settle.transfers.map((t) => (
                  <li key={`${t.from}-${t.to}`} className={styles.transfer}>
                    <p className={styles.slip}>
                      <span className={styles.who}>{nameOf(t.from)}</span>
                      <span className={styles.pays}>{t.from === me ? 'pay' : 'pays'}</span>
                      <span className={styles.who}>{t.to === me ? 'you' : nameOf(t.to)}</span>
                      <span className={styles.owed}>{formatRupees(t.amount)}</span>
                    </p>
                    {planner && (
                      <Button variant="plain" className={styles.small} onClick={() => setPaying({ from: t.from, to: t.to, amount: t.amount })}>
                        Mark as paid<span className="visually-hidden">: {nameOf(t.from)} to {t.to === me ? 'you' : nameOf(t.to)}</span>
                      </Button>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}

          <h3 className={styles.subheading}>Each person</h3>
          <table className={styles.balances}>
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Paid</th>
                <th scope="col">Share</th>
                <th scope="col">Balance</th>
              </tr>
            </thead>
            <tbody>
              {settle.people.map((p) => (
                <tr key={p.uid}>
                  <th scope="row">
                    {nameOf(p.uid)}
                    {!p.member && <span className={styles.left}> (left the trip)</span>}
                  </th>
                  <td>{formatRupees(p.paid)}</td>
                  <td>{formatRupees(p.share)}</td>
                  <td className={p.balance < 0 ? styles.owes : undefined}>
                    {p.balance === 0 ? 'Square' : p.balance > 0 ? `Gets back ${formatRupees(p.balance)}` : `Owes ${formatRupees(-p.balance)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className={styles.budget} aria-labelledby="budget-title">
          <h2 id="budget-title" className={styles.heading}>
            Budget
          </h2>
          <BudgetBar spent={budget.spent} budget={budget.budget} />
          {budget.byCategory.length > 0 ? (
            <>
              <h3 className={styles.subheading}>Spent by category</h3>
              <CategoryChart rows={budget.byCategory} />
              <p className={styles.note}>Each colour is a kilometre stone's cap: yellow like a National Highway, green like a State Highway. Payments marked as paid are not spending, so they are not counted.</p>
            </>
          ) : (
            <p className={styles.note}>No bills yet, so nothing is spent.</p>
          )}
        </section>
          </>
        )}
      </div>

      <section className={styles.bills} aria-labelledby="bills-title">
        <div className={styles.billsHead}>
          <h2 id="bills-title" className={styles.heading}>
            Bills and payments{bills ? `, ${filtered ? `${bills.total} of ${bills.allTotal}` : bills.allTotal}` : ''}
          </h2>
          {planner && !adding && <Button onClick={() => setAdding(true)}>Add a bill</Button>}
        </div>

        {adding && (
          <div className={styles.addBoard}>
            <h3 className={styles.subheading}>Add a bill</h3>
            <ExpenseForm
              trip={trip}
              me={me}
              onSaved={async (saved) => {
                setFreshId(saved?.id ?? null);
                await refresh();
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          </div>
        )}

        {!planner && <p className={styles.viewer}>You can view this trip. Only the owner and editors add bills or mark payments.</p>}

        {(filtered || (bills && bills.allTotal > 0)) && (
          <div className={styles.filters} role="group" aria-label="Filter the bills">
            <SelectField
              label="Category"
              value={filters.category}
              onChange={changeFilter('category')}
              options={[{ value: '', label: 'All categories' }, ...CATEGORIES.map((c) => ({ value: c.value, label: c.label })), { value: 'settlement', label: 'Payments marked as paid' }]}
            />
            <SelectField
              label="Involving"
              value={filters.person}
              onChange={changeFilter('person')}
              options={[{ value: '', label: 'Everyone' }, ...trip.members.map((m) => ({ value: m.uid, label: m.uid === me ? `${m.name} (you)` : m.name }))]}
            />
            {(filters.category || filters.person) && (
              <Button variant="plain" className={styles.clear} onClick={clearFilters}>
                Clear the filters
              </Button>
            )}
          </div>
        )}

        {list.status === 'loading' && <RoadLoader label="Loading the bills" />}

        {list.status === 'error' && (
          <div className={styles.problem}>
            <Notice tone="warning" title="The bills could not be loaded">
              <p>{list.message} Settle up and the budget above do not depend on this list.</p>
            </Notice>
            <Button variant="plain" onClick={loadBills}>
              Try loading the bills again
            </Button>
          </div>
        )}

        {list.status === 'ready' && expenses.length === 0 && (
          <div className={styles.empty}>
            <span className={styles.emptySlip} aria-hidden="true" />
            {filtered ? (
              <p>
                No bills match these filters. <button type="button" className={styles.linkButton} onClick={clearFilters}>Show every bill again</button>
              </p>
            ) : (
              <p>No bills yet. The first one usually is the stay or the bus tickets.</p>
            )}
          </div>
        )}

        {list.status === 'ready' && expenses.length > 0 && (
          <ul className={styles.ledger} aria-label="All bills and payments" aria-busy={Boolean(list.refreshing)}>
            {expenses.map((e) =>
              editingId === e.id ? (
                <li key={e.id} className={styles.editRow}>
                  <h3 className={styles.subheading}>Edit "{e.title}"</h3>
                  <ExpenseForm
                    trip={trip}
                    me={me}
                    expense={e}
                    onSaved={async () => {
                      await refresh();
                      setEditingId(null);
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                </li>
              ) : (
                <li key={e.id} className={`${styles.entry} ${e.type === 'settlement' ? styles.payment : ''} ${e.id === freshId ? 'ts-wet' : ''}`}>
                  <span className={`${styles.swatch} ${styles[e.type === 'settlement' ? 'paid' : ROAD[e.category]]}`} aria-hidden="true" />
                  <div className={styles.entryText}>
                    <h3 className={styles.entryTitle}>{e.type === 'settlement' ? `${nameOf(e.paidBy)} paid ${sentenceName(e.splits[0].uid)}` : e.title}</h3>
                    <p className={styles.entryMeta}>
                      {e.type === 'settlement'
                        ? `Payment marked as paid, ${formatDate(e.date)}. Not counted as spending.`
                        : `${CATEGORY_LABEL[e.category]}. ${nameOf(e.paidBy)} paid, ${formatDate(e.date)}. ${e.splitType === 'equal' ? `Split equally, ${plural(e.splits.length, 'way')}` : `Exact shares, ${plural(e.splits.length, 'person', 'people')}`}.`}
                    </p>
                    {e.type === 'expense' && (
                      <p className={styles.shares}>
                        {e.splits.map((s) => `${nameOf(s.uid)} ${formatRupees(s.share)}`).join(', ')}
                      </p>
                    )}
                  </div>
                  <p className={styles.entryAmount}>{formatRupees(e.amount)}</p>
                  {canChange(e) && (
                    <div className={styles.entryActions}>
                      {e.type === 'expense' && (
                        <Button variant="plain" className={styles.small} onClick={() => setEditingId(e.id)}>
                          Edit<span className="visually-hidden"> {e.title}</span>
                        </Button>
                      )}
                      <Button variant="plain" className={styles.small} onClick={() => setDeleting(e)}>
                        Delete<span className="visually-hidden"> {e.type === 'settlement' ? 'this payment' : e.title}</span>
                      </Button>
                    </div>
                  )}
                </li>
              ),
            )}
          </ul>
        )}

        {list.status === 'ready' && bills.pages > 1 && (
          <nav className={styles.pager} aria-label="Pages of bills">
            <Button variant="plain" className={styles.small} disabled={bills.page <= 1} onClick={() => setPage(bills.page - 1)}>
              Previous page
            </Button>
            <p className={styles.pageNote}>
              Page {bills.page} of {bills.pages}. Showing {(bills.page - 1) * bills.pageSize + 1} to {(bills.page - 1) * bills.pageSize + expenses.length} of {bills.total}.
            </p>
            <Button variant="plain" className={styles.small} disabled={bills.page >= bills.pages} onClick={() => setPage(bills.page + 1)}>
              Next page
            </Button>
          </nav>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(deleting)}
        title={deleting?.type === 'settlement' ? 'Delete this payment?' : deleting ? `Delete "${deleting.title}"?` : ''}
        confirmLabel={deleting?.type === 'settlement' ? 'Delete the payment' : 'Delete the bill'}
        busyLabel="Deleting"
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      >
        <p>{deleting?.type === 'settlement' ? 'The money goes back to being owed, and settle up changes for everyone.' : 'It disappears for everyone, and the budget and settle up are worked out again.'}</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(paying)}
        tone="primary"
        title={paying ? `${nameOf(paying.from)} paid ${sentenceName(paying.to)} ${formatRupees(paying.amount)}?` : ''}
        confirmLabel="Yes, mark as paid"
        cancelLabel="Not yet"
        busyLabel="Marking"
        busy={payBusy}
        onConfirm={confirmPaid}
        onCancel={() => setPaying(null)}
      >
        <p>Mark it only once the money has really changed hands. It is saved as a payment in the bills, and can be deleted if it was a mistake.</p>
      </ConfirmDialog>
    </div>
  );
}
