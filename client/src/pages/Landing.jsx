import { Link } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { formatRupees } from '../utils/format';
import Wordmark from '../components/Wordmark';
import Milestone from '../components/Milestone';
import Button from '../components/Button';
import styles from './Landing.module.css';

// The example trip shown on the landing page. It is labelled as an example on
// screen; no numbers here pretend to be usage statistics.
const EXAMPLE_DAYS = [
  { day: 1, place: 'Manali', plan: 'Arrive on the overnight Volvo, check in near Mall Road' },
  { day: 2, place: 'Solang', plan: 'Solang Valley, then the Atal Tunnel', rain: true },
  { day: 3, place: 'Old Manali', plan: 'Hadimba Temple, Vashisht hot springs' },
  { day: 4, place: 'Delhi', plan: 'Overnight bus home' },
];

// The settle-up example from the project brief, in paise like the real data.
// Ashish paid 8,000 (hotel), Rahul paid 2,000 (dinner), four people share both.
const EXAMPLE_PAYMENTS = [
  { from: 'Ankit', to: 'Ashish', paise: 250000 },
  { from: 'Rohan', to: 'Ashish', paise: 250000 },
  { from: 'Rahul', to: 'Ashish', paise: 50000 },
];

export default function Landing() {
  const { status } = useAuth();
  const signedIn = status === 'signedIn';

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Wordmark />
        <nav className={styles.nav} aria-label="Account">
          {signedIn ? (
            <Button to="/trips">Open my trips</Button>
          ) : (
            <>
              <Link className={styles.navLink} to="/login">
                Log in
              </Link>
              {/* On phones this is hidden: the same button sits right under the headline */}
              <Button to="/register" className={styles.navCta}>
                Create an account
              </Button>
            </>
          )}
        </nav>
      </header>

      <main>
        <section className={styles.intro} aria-labelledby="intro-title">
          <h1 id="intro-title" className={styles.title}>
            For the group trip that currently lives in a WhatsApp chat
          </h1>
          <p className={styles.lead}>
            TripSync keeps one shared plan for everyone going: the stops for each day on a map, the forecast for each
            day, every bill someone paid, and at the end, the shortest list of who pays whom.
          </p>
          <p className={styles.lead}>
            Invite the group with a link. The trip owner decides who can edit the plan and who can only look.
          </p>
          {!signedIn && (
            <div className={styles.actions}>
              <Button to="/register">Create an account</Button>
              <Button to="/login" variant="plain">
                Log in
              </Button>
            </div>
          )}
        </section>

        <section className={styles.route} aria-labelledby="route-title">
          <div className={styles.routeText}>
            <h2 id="route-title">Every day of the trip, in order</h2>
            <p>
              Each date gets its own stone. Add stops by searching for a place, see them pinned on the map, and check
              that day&rsquo;s forecast. If rain is likely on a day with stops planned, TripSync puts up a warning.
            </p>
            <p className={styles.exampleLabel}>Example: four days in Manali</p>
          </div>

          <ol className={styles.road} tabIndex={0} aria-label="Example trip, day by day">
            {EXAMPLE_DAYS.map((d) => (
              <li key={d.day} className={styles.stop}>
                <div className={styles.post}>
                  <Milestone cap={d.place} caption="day" aria-hidden="true">
                    {d.day}
                  </Milestone>
                </div>
                <p className={styles.plan}>
                  <span className="visually-hidden">
                    Day {d.day}, {d.place}:{' '}
                  </span>
                  {d.plan}
                </p>
                {d.rain && <p className={styles.rain}>Rain likely, and the stops are outdoors</p>}
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.money} aria-labelledby="money-title">
          <div>
            <h2 id="money-title">Who owes whom, worked out</h2>
            <p>
              Log a bill when someone pays, and split it equally or by exact amounts. TripSync keeps everyone&rsquo;s
              balance, then gives the fewest payments that square the group. Mark each one as paid once the UPI transfer
              goes through.
            </p>
          </div>

          <figure className={styles.ledger}>
            <figcaption className={styles.ledgerNote}>
              Example: Ashish paid {formatRupees(800000)} for the hotel and Rahul paid {formatRupees(200000)} for
              dinner. Four friends share both, so each share is {formatRupees(250000)}.
            </figcaption>
            <ul className={styles.payments}>
              {EXAMPLE_PAYMENTS.map((p) => (
                <li key={p.from} className={styles.payment}>
                  <span>
                    <strong>{p.from}</strong> pays <strong>{p.to}</strong>
                  </span>
                  <span className={styles.amount}>{formatRupees(p.paise)}</span>
                </li>
              ))}
            </ul>
            <p className={styles.ledgerTotal}>Three payments, and everyone is square.</p>
          </figure>
        </section>
      </main>

      <footer className={styles.footer}>
        <p>
          TripSync plans trips. It does not book tickets or hotels. A college project by Ashish Bisht and Dhruv Grover.
        </p>
      </footer>
    </div>
  );
}
