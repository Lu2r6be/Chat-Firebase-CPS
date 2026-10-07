import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb, adminRealtimeDb } from './firebaseAdmin.js';

const app = express();
app.use(express.json({ limit: '32kb' }));

async function authenticate(req, res, next) {
  const match = req.headers.authorization?.match(/^Bearer (.+)$/);
  if (!match) return res.status(401).json({ error: 'Autenticação necessária.' });
  try {
    req.identity = await adminAuth.verifyIdToken(match[1]);
    return next();
  } catch {
    return res.status(401).json({ error: 'Sessão inválida.' });
  }
}

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

function apiError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function syncGroupMembers(groupId, group) {
  const version = Number.isInteger(group.membershipVersion) ? group.membershipVersion : 0;
  const memberIds = Object.fromEntries(group.memberIds.map((uid) => [uid, true]));
  await adminRealtimeDb.ref(`groupMembers/${groupId}`).transaction((current) => {
    const currentVersion = Number.isInteger(current?.membershipVersion) ? current.membershipVersion : -1;
    if (current && currentVersion > version) return;
    return { ownerId: group.ownerId, memberIds, membershipVersion: version };
  });
}

function readGroupMembership(groupId, data) {
  if (data.id !== groupId || typeof data.ownerId !== 'string'
    || !Array.isArray(data.memberIds) || !data.memberIds.every((uid) => typeof uid === 'string')
    || data.memberIds.length < 2 || !data.memberIds.includes(data.ownerId)
    || new Set(data.memberIds).size !== data.memberIds.length
    || !Number.isInteger(data.memberLimit) || data.memberLimit < 2 || data.memberLimit > 100
    || data.memberIds.length > data.memberLimit
    || (data.membershipVersion !== undefined && (!Number.isInteger(data.membershipVersion) || data.membershipVersion < 0))) return null;
  return {
    id: groupId,
    ownerId: data.ownerId,
    memberIds: data.memberIds,
    memberLimit: data.memberLimit,
    membershipVersion: Number.isInteger(data.membershipVersion) ? data.membershipVersion : 0,
    photoUrl: typeof data.photoUrl === 'string' ? data.photoUrl : '',
  };
}

app.post('/groups/:groupId/sync', authenticate, async (req, res) => {
  const { groupId } = req.params;
  if (!groupId || groupId.length > 256) return res.status(400).json({ error: 'Grupo inválido.' });
  try {
    const snapshot = await adminDb.collection('groups').doc(groupId).get();
    if (!snapshot.exists) return res.status(404).json({ error: 'Grupo não encontrado.' });
    const group = readGroupMembership(groupId, snapshot.data());
    if (!group || !group.memberIds.includes(req.identity.uid)) return res.status(403).json({ error: 'Você não é integrante deste grupo.' });
    await syncGroupMembers(groupId, group);
    return res.json({ memberIds: group.memberIds, photoUrl: group.photoUrl });
  } catch {
    return res.status(500).json({ error: 'Não foi possível sincronizar os integrantes do grupo.' });
  }
});

app.post('/groups/:groupId/members', authenticate, async (req, res) => {
  const { groupId } = req.params;
  const { action, memberId } = req.body ?? {};
  if (!groupId || groupId.length > 256 || (action !== 'add' && action !== 'remove')
    || typeof memberId !== 'string' || memberId.length === 0 || memberId.length > 128) {
    return res.status(400).json({ error: 'Dados de integrante inválidos.' });
  }
  try {
    const groupRef = adminDb.collection('groups').doc(groupId);
    const group = await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(groupRef);
      if (!snapshot.exists) throw apiError(404, 'Grupo não encontrado.');
      const current = readGroupMembership(groupId, snapshot.data());
      if (!current) throw apiError(409, 'Os dados do grupo estão inválidos.');
      if (current.ownerId !== req.identity.uid) throw apiError(403, 'Somente o proprietário pode gerenciar integrantes.');

      if (action === 'add' && !current.memberIds.includes(memberId)) {
        if (current.memberIds.length >= current.memberLimit) throw apiError(409, 'O grupo atingiu o limite de integrantes.');
        const profile = await transaction.get(adminDb.collection('publicProfiles').doc(memberId));
        if (!profile.exists) throw apiError(404, 'O usuário não foi encontrado.');
      }
      if (action === 'remove' && memberId === current.ownerId) throw apiError(400, 'O proprietário não pode ser removido do grupo.');
      if (action === 'remove' && current.memberIds.includes(memberId) && current.memberIds.length <= 2) {
        throw apiError(400, 'O grupo precisa manter pelo menos dois integrantes.');
      }

      const nextMemberIds = action === 'add'
        ? [...new Set([...current.memberIds, memberId])]
        : current.memberIds.filter((uid) => uid !== memberId);
      if (nextMemberIds.length === current.memberIds.length) return current;

      const membershipVersion = current.membershipVersion + 1;
      transaction.update(groupRef, {
        memberIds: nextMemberIds,
        membershipVersion,
        updatedAt: Date.now(),
      });
      return { ...current, memberIds: nextMemberIds, membershipVersion };
    });
    await syncGroupMembers(groupId, group);
    return res.json({ memberIds: group.memberIds });
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    return res.status(status).json({ error: status === 500 ? 'Não foi possível atualizar os integrantes.' : error.message });
  }
});

app.post('/uploads/signature', authenticate, async (req, res) => {
  const { kind, groupId } = req.body ?? {};
  if (kind !== 'profile' && kind !== 'group') return res.status(400).json({ error: 'Tipo de foto inválido.' });
  if (kind === 'group') {
    if (typeof groupId !== 'string') return res.status(400).json({ error: 'Grupo inválido.' });
    const group = await adminDb.collection('groups').doc(groupId).get();
    if (!group.exists || group.data()?.ownerId !== req.identity.uid) return res.status(403).json({ error: 'Somente o proprietário pode alterar a foto do grupo.' });
  }
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    return res.status(503).json({ error: 'Armazenamento de fotos ainda não configurado.' });
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `chat-firebase/${kind}`;
  const publicId = `${req.identity.uid}_${crypto.randomUUID()}`;
  const params = { folder, overwrite: 'true', public_id: publicId, timestamp };
  const toSign = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join('&');
  const signature = crypto.createHash('sha1').update(`${toSign}${process.env.CLOUDINARY_API_SECRET}`).digest('hex');
  return res.json({ cloudName: process.env.CLOUDINARY_CLOUD_NAME, apiKey: process.env.CLOUDINARY_API_KEY, signature, timestamp, folder, publicId });
});

app.get('/profiles/:uid', authenticate, async (req, res) => {
  const viewerId = req.identity.uid;
  const targetId = req.params.uid;
  if (!targetId || targetId.length > 128) return res.status(400).json({ error: 'Usuário inválido.' });
  let permitted = viewerId === targetId;
  if (!permitted) {
    const directId = [viewerId, targetId].sort().join('_');
    const direct = await adminDb.collection('directConversations').doc(directId).get();
    permitted = direct.exists && direct.data()?.participants?.includes(viewerId) && direct.data()?.participants?.includes(targetId);
  }
  if (!permitted) {
    const groups = await adminDb.collection('groups').where('memberIds', 'array-contains', viewerId).get();
    permitted = groups.docs.some((group) => group.data().memberIds?.includes(targetId));
  }
  if (!permitted) return res.status(403).json({ error: 'Perfil disponível apenas para integrantes de uma conversa ou grupo.' });
  const profile = await adminDb.collection('users').doc(targetId).get();
  if (!profile.exists) return res.status(404).json({ error: 'Perfil não encontrado.' });
  const data = profile.data();
  return res.json({ uid: targetId, name: data.name, email: data.email, phoneNumber: data.phoneNumber, birthDate: data.birthDate, photoUrl: data.photoUrl });
});

async function resolveRecipients(conversationId, message) {
  if (message.conversationType === 'direct') {
    const conversation = await adminDb.collection('directConversations').doc(conversationId).get();
    const participants = conversation.data()?.participants;
    if (!conversation.exists || !Array.isArray(participants) || !participants.includes(message.senderId)) return [];
    return participants.filter((uid) => uid !== message.senderId);
  }
  if (message.conversationType !== 'group') return [];
  const group = await adminDb.collection('groups').doc(conversationId).get();
  const data = group.data();
  if (!group.exists || !Array.isArray(data?.memberIds) || !data.memberIds.includes(message.senderId)) return [];
  if (data.notificationPolicy === 'disabled' || data.notificationPolicy === 'direct_messages_only') return [];
  if (data.notificationPolicy === 'mentioned_members') {
    const target = message.target?.type === 'member' ? message.target.memberId : null;
    return target && target !== message.senderId && data.memberIds.includes(target) ? [target] : [];
  }
  return data.memberIds.filter((uid) => uid !== message.senderId);
}

app.post('/notifications/messages', authenticate, async (req, res) => {
  const { conversationId, messageId } = req.body ?? {};
  if (typeof conversationId !== 'string' || typeof messageId !== 'string' || conversationId.length > 256 || messageId.length > 128) {
    return res.status(400).json({ error: 'Conversa ou mensagem inválida.' });
  }
  const messageSnapshot = await adminRealtimeDb.ref(`messages/${conversationId}/${messageId}`).get();
  const message = messageSnapshot.val();
  if (!message || message.id !== messageId || message.conversationId !== conversationId || message.senderId !== req.identity.uid) {
    return res.status(403).json({ error: 'A mensagem não pertence à sua sessão.' });
  }
  const requestKey = crypto.createHash('sha256').update(`${conversationId}:${messageId}`).digest('hex');
  const requestRef = adminDb.collection('notificationRequests').doc(requestKey);
  const claimed = await adminDb.runTransaction(async (transaction) => {
    const existing = await transaction.get(requestRef);
    if (existing.exists) return false;
    transaction.create(requestRef, { conversationId, senderId: req.identity.uid, status: 'processing', createdAt: FieldValue.serverTimestamp() });
    return true;
  });
  if (!claimed) return res.json({ status: 'already_processed' });
  try {
    const recipients = await resolveRecipients(conversationId, message);
    const tokens = [];
    for (const uid of recipients) {
      const devices = await adminDb.collection('users').doc(uid).collection('devices').where('enabled', '==', true).get();
      devices.docs.forEach((device) => {
        const token = device.data().token;
        if (typeof token === 'string' && token.startsWith('ExponentPushToken[')) tokens.push({ uid, id: device.id, token });
      });
    }
    for (let index = 0; index < tokens.length; index += 100) {
      const batch = tokens.slice(index, index + 100);
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(batch.map(({ token }) => ({ to: token, title: 'Nova mensagem', body: 'Você recebeu uma mensagem.', sound: 'default', data: { conversationId, conversationType: message.conversationType } }))),
      });
      if (!response.ok) throw new Error(`Expo Push retornou ${response.status}.`);
      const result = await response.json();
      if (!Array.isArray(result.data) || result.data.length !== batch.length) {
        throw new Error('Expo Push retornou uma resposta inválida.');
      }
      const tickets = result.data;
      await Promise.all(tickets.map(async (ticket, ticketIndex) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          const tokenInfo = batch[ticketIndex];
          await adminDb.collection('users').doc(tokenInfo.uid).collection('devices').doc(tokenInfo.id).update({ enabled: false });
        }
      }));
      if (tickets.some((ticket) => ticket.status === 'error' && ticket.details?.error !== 'DeviceNotRegistered')) {
        throw new Error('Expo Push não aceitou uma ou mais notificações.');
      }
    }
    await requestRef.update({ status: 'sent', recipientCount: recipients.length, completedAt: FieldValue.serverTimestamp() });
    return res.json({ status: 'sent', recipientCount: recipients.length });
  } catch (error) {
    await requestRef.update({ status: 'failed', error: String(error?.message ?? 'Falha no envio').slice(0, 300), completedAt: FieldValue.serverTimestamp() });
    return res.status(502).json({ error: 'Não foi possível enviar as notificações.' });
  }
});

const port = Number(process.env.PORT ?? 3000);
if (process.env.VERCEL !== '1') app.listen(port, '0.0.0.0', () => console.log(`API pronta na porta ${port}`));

export default app;
