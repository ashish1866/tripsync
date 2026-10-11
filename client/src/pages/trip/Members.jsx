import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import api, { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/Button';
import Notice from '../../components/Notice';
import ConfirmDialog from '../../components/ConfirmDialog';
import ChoicePlates from '../../components/ChoicePlates';
import RoadLoader from '../../components/RoadLoader';
import { formatDate, plural } from '../../utils/format';
import { ROLE_CAN, ROLE_LABEL } from '../../utils/roles';
import styles from './Members.module.css';

const ORDER = { owner: 0, editor: 1, viewer: 2 };

// /trips/:id/members : the group. The owner invites, changes roles and removes
// people; everyone else can leave. (The server refuses all of it for anyone
// else anyway; hiding the buttons is only to keep the page honest.)
export default function Members() {
  const { trip, setTrip } = useOutletContext();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const isOwner = trip.myRole === 'owner';
  const [busyUid, setBusyUid] = useState(null);
  const [problem, setProblem] = useState(null);
  const [removing, setRemoving] = useState(null); // member being asked about, or "me"
  const [removeBusy, setRemoveBusy] = useState(false);

  const members = [...trip.members].sort((a, b) => ORDER[a.role] - ORDER[b.role] || a.name.localeCompare(b.name));

  async function changeRole(member) {
    const role = member.role === 'editor' ? 'viewer' : 'editor';
    setBusyUid(member.uid);
    setProblem(null);
    try {
      const { data } = await api.patch(`/trips/${trip.id}/members/${member.uid}`, { role });
      setTrip(data.trip);
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setBusyUid(null);
    }
  }

  async function confirmRemove() {
    const leaving = removing.uid === profile.uid;
    setRemoveBusy(true);
    setProblem(null);
    try {
      const { data } = await api.delete(`/trips/${trip.id}/members/${removing.uid}`);
      if (leaving) return navigate('/trips', { replace: true });
      setTrip(data.trip);
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setRemoveBusy(false);
      setRemoving(null);
    }
  }

  const leavingMyself = removing && removing.uid === profile.uid;

  return (
    <div className={styles.layout}>
      <section className={styles.group} aria-labelledby="group-title">
        <h2 id="group-title" className={styles.heading}>
          The group, {plural(trip.members.length, 'person', 'people')}
        </h2>
        {problem && <Notice tone="warning">{problem}</Notice>}
        <ul className={styles.list} aria-label="People in this trip">
          {members.map((m) => {
            const me = m.uid === profile.uid;
            return (
              <li key={m.uid} className={styles.member}>
                <div className={styles.who}>
                  <p className={styles.name}>
                    {m.name}
                    {me && <span className={styles.you}>You</span>}
                  </p>
                  <p className={styles.role}>
                    <span className={styles.roleName}>{ROLE_LABEL[m.role]}</span> {ROLE_CAN[m.role]}
                  </p>
                  <p className={styles.since}>Joined {formatDate(m.joinedAt)}</p>
                </div>
                {isOwner && m.role !== 'owner' && (
                  <div className={styles.memberActions}>
                    <Button variant="plain" className={styles.small} busy={busyUid === m.uid} onClick={() => changeRole(m)}>
                      {busyUid === m.uid ? 'Changing' : m.role === 'editor' ? 'Make viewer' : 'Make editor'}
                      <span className="visually-hidden"> ({m.name})</span>
                    </Button>
                    <Button variant="plain" className={styles.small} onClick={() => setRemoving(m)} disabled={busyUid === m.uid}>
                      Remove<span className="visually-hidden"> {m.name}</span>
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {isOwner ? (
          <p className={styles.ownerNote}>You own this trip, so you cannot leave it. To end it for everyone, delete it in Trip settings.</p>
        ) : (
          <section className={styles.leave} aria-labelledby="leave-title">
            <h3 id="leave-title" className={styles.subheading}>
              Leave this trip
            </h3>
            <p>You lose access at once. Bills you are part of stay in the trip. If you still owe money, settle up first.</p>
            <Button variant="danger" onClick={() => setRemoving(trip.members.find((m) => m.uid === profile.uid))}>
              Leave the trip
            </Button>
          </section>
        )}
      </section>

      {isOwner && <Invites trip={trip} />}

      <ConfirmDialog
        open={Boolean(removing)}
        title={leavingMyself ? `Leave "${trip.name}"?` : removing ? `Remove ${removing.name}?` : ''}
        confirmLabel={leavingMyself ? 'Leave the trip' : 'Remove from the trip'}
        busyLabel={leavingMyself ? 'Leaving' : 'Removing'}
        busy={removeBusy}
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      >
        <p>
          {leavingMyself
            ? 'The trip disappears from your list. The owner can invite you again later.'
            : `${removing?.name} loses access to the trip at once. Their stops and bills stay. The trip refuses this if they still owe money.`}
        </p>
      </ConfirmDialog>
    </div>
  );
}

// The owner's invite board: make a link for Editors or Viewers, see the ones still working.
function Invites({ trip }) {
  const [role, setRole] = useState('editor');
  const [list, setList] = useState({ state: 'loading', invites: [] });
  const [making, setMaking] = useState(false);
  const [problem, setProblem] = useState(null);
  const [copied, setCopied] = useState(null);
  const [revoking, setRevoking] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/trips/${trip.id}/invites`);
      setList({ state: 'ready', invites: data.invites });
    } catch (err) {
      setList({ state: 'error', invites: [], message: errorMessage(err) });
    }
  }, [trip.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function make() {
    setMaking(true);
    setProblem(null);
    try {
      const { data } = await api.post(`/trips/${trip.id}/invites`, { role });
      setList((l) => ({ state: 'ready', invites: [data.invite, ...l.invites] }));
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setMaking(false);
    }
  }

  async function revoke(code) {
    setRevoking(code);
    setProblem(null);
    try {
      await api.delete(`/trips/${trip.id}/invites/${code}`);
      setList((l) => ({ ...l, invites: l.invites.filter((i) => i.code !== code) }));
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setRevoking(null);
    }
  }

  async function copy(link, code) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(code);
    } catch {
      setCopied(`failed:${code}`);
    }
  }

  const linkFor = (code) => `${window.location.origin}/join/${code}`;

  return (
    <section className={styles.invites} aria-labelledby="invite-title">
      <h2 id="invite-title" className={styles.heading}>
        Invite people
      </h2>
      <p className={styles.lead}>Make a link, then send it to the group chat. Anyone with it can join for 7 days. Codes can be typed in on the Your trips page.</p>
      <ChoicePlates
        legend="They join as"
        value={role}
        onChange={setRole}
        disabled={making}
        options={[
          { value: 'editor', label: 'Editor', hint: ROLE_CAN.editor },
          { value: 'viewer', label: 'Viewer', hint: ROLE_CAN.viewer },
        ]}
      />
      <Button onClick={make} busy={making}>
        {making ? 'Making the link' : role === 'editor' ? 'Make an Editor link' : 'Make a Viewer link'}
      </Button>
      {problem && <Notice tone="warning">{problem}</Notice>}

      <h3 className={styles.subheading}>Links that still work</h3>
      {list.state === 'loading' && <RoadLoader label="Loading the invites" />}
      {list.state === 'error' && (
        <div className={styles.problem}>
          <Notice tone="warning" title="The invites could not be loaded">
            <p>{list.message}</p>
          </Notice>
          <Button variant="plain" onClick={load}>
            Try loading them again
          </Button>
        </div>
      )}
      {list.state === 'ready' && list.invites.length === 0 && <p className={styles.none}>No working links. Make one above when you are ready to invite the group.</p>}
      {list.state === 'ready' && list.invites.length > 0 && (
        <ul className={styles.inviteList} aria-label="Invite links that still work">
          {list.invites.map((inv) => (
            <li key={inv.code} className={styles.invite}>
              <p className={styles.code}>
                <span className="visually-hidden">Code </span>
                {inv.code}
              </p>
              <p className={styles.inviteMeta}>
                {ROLE_LABEL[inv.role]} link. Works until {formatDate(inv.expiresAt)}.
              </p>
              <p className={styles.link}>{linkFor(inv.code)}</p>
              <div className={styles.inviteActions}>
                <Button variant="plain" className={styles.small} onClick={() => copy(linkFor(inv.code), inv.code)}>
                  {copied === inv.code ? 'Link copied' : 'Copy link'}
                </Button>
                <Button variant="plain" className={styles.small} busy={revoking === inv.code} onClick={() => revoke(inv.code)}>
                  {revoking === inv.code ? 'Stopping' : 'Stop this link'}
                </Button>
              </div>
              {copied === `failed:${inv.code}` && <p className={styles.none}>This browser did not allow copying. Select the link above and copy it by hand.</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
