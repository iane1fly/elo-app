import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';

export type ConnectionStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export interface NetworkConnection {
  id: string;
  memberUids: string[];
  requesterUid: string;
  recipientUid: string;
  memberNames?: Record<string, string>;
  status: ConnectionStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ConnectionActor {
  uid: string;
  name: string;
}

export function connectionIdFor(firstUid: string, secondUid: string): string {
  return [firstUid, secondUid].sort().join('_');
}

export function watchConnections(
  uid: string,
  onData: (connections: NetworkConnection[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const connectionsQuery = query(
    collection(db, 'connections'),
    where('memberUids', 'array-contains', uid),
  );
  return onSnapshot(
    connectionsQuery,
    (snapshot) => onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as NetworkConnection)),
    (error) => onError(error),
  );
}

export async function sendConnectionRequest(actor: ConnectionActor, recipient: ConnectionActor) {
  const recipientUid = recipient.uid;
  if (actor.uid === recipientUid) throw new Error('Não podes enviar um pedido para ti próprio.');

  const memberUids = [actor.uid, recipientUid].sort();
  const connectionRef = doc(db, 'connections', connectionIdFor(actor.uid, recipientUid));
  const notificationRef = doc(collection(db, 'notifications'));

  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(connectionRef);
    const oldConnection = existing.data() as NetworkConnection | undefined;
    if (oldConnection?.status === 'accepted' || oldConnection?.status === 'pending') {
      throw new Error(oldConnection.status === 'accepted' ? 'Já estão ligados.' : 'Já existe um pedido de ligação.');
    }

    const connection = {
      memberUids,
      requesterUid: actor.uid,
      recipientUid,
      memberNames: { [actor.uid]: actor.name, [recipient.uid]: recipient.name },
      status: 'pending' as const,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    transaction.set(connectionRef, connection);
    transaction.set(notificationRef, {
      recipientUid,
      actorUid: actor.uid,
      actorName: actor.name,
      connectionId: connectionRef.id,
      type: 'connection_request',
      read: false,
      createdAt: serverTimestamp(),
    });
  });
}

export async function respondToConnectionRequest(
  connection: NetworkConnection,
  actor: ConnectionActor,
  response: 'accepted' | 'rejected',
) {
  const connectionRef = doc(db, 'connections', connection.id);
  const conversationRef = doc(db, 'conversations', connection.id);
  const notificationRef = response === 'accepted' ? doc(collection(db, 'notifications')) : null;

  await runTransaction(db, async (transaction) => {
    const [snapshot, conversationSnapshot] = await Promise.all([
      transaction.get(connectionRef),
      transaction.get(conversationRef),
    ]);
    const current = snapshot.data() as NetworkConnection | undefined;
    if (!current || current.status !== 'pending' || current.recipientUid !== actor.uid) {
      throw new Error('Este pedido já não está disponível. Atualiza a página e tenta novamente.');
    }

    transaction.update(connectionRef, { status: response, updatedAt: serverTimestamp() });
    if (response === 'accepted' && !conversationSnapshot.exists()) {
      transaction.set(conversationRef, {
        memberUids: current.memberUids,
        memberNames: current.memberNames || {},
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastMessage: '',
        lastMessageAt: null,
      });
    }
    if (notificationRef && current.requesterUid) {
      transaction.set(notificationRef, {
        recipientUid: current.requesterUid,
        actorUid: actor.uid,
        actorName: actor.name,
        connectionId: connectionRef.id,
        type: 'connection_accepted',
        read: false,
        createdAt: serverTimestamp(),
      });
    }
  });
}

export async function cancelOrDisconnectConnection(connection: NetworkConnection, actorUid: string) {
  const connectionRef = doc(db, 'connections', connection.id);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(connectionRef);
    const current = snapshot.data() as NetworkConnection | undefined;
    if (!current || !current.memberUids?.includes(actorUid)) {
      throw new Error('Não tens permissão para alterar esta ligação.');
    }
    if (current.status === 'pending' && current.requesterUid !== actorUid) {
      throw new Error('Só quem enviou o pedido o pode cancelar.');
    }
    if (current.status !== 'pending' && current.status !== 'accepted') return;
    transaction.update(connectionRef, { status: 'cancelled', updatedAt: serverTimestamp() });
  });
}
