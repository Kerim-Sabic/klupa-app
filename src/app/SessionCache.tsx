import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useAuth } from '../lib/auth';

/**
 * What was read for one coach must not stay in memory for the next person who signs in on
 * the same phone. When the signed-in account changes, or signs out, everything read from the
 * server is dropped. Events still waiting to be sent stay in the outbox: dropping them would
 * lose something a coach recorded, and the database decides who may send them.
 */
export function SessionCache() {
  const { state } = useAuth();
  const client = useQueryClient();
  const account = state.status === 'signed-in' ? state.user.id : null;
  const previous = useRef(account);

  useEffect(() => {
    if (previous.current !== null && previous.current !== account) client.clear();
    previous.current = account;
  }, [account, client]);

  return null;
}
