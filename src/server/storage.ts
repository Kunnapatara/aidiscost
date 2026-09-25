/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { User, UserSession, Entitlement, FindingOwnership, ProcessedWebhookEvent } from './types';

interface StoreSchema {
  users: Record<string, User>; // email -> User
  usersById: Record<string, string>; // id -> email
  sessions: Record<string, UserSession>; // token -> UserSession
  findingOwnerships: Record<string, FindingOwnership>; // finding_id -> FindingOwnership
  entitlements: Record<string, Entitlement>; // `${user_id}:${finding_id}` -> Entitlement
  processedWebhooks: Record<string, ProcessedWebhookEvent>; // event_id -> ProcessedWebhookEvent
}

export class ServerStorage {
  private static instance: ServerStorage;
  private filePath: string;
  private data: StoreSchema;
  private saveTimeout: NodeJS.Timeout | null = null;
  private isTestMode = false;

  private constructor(storageDir = 'data', fileName = 'aidiscost-db.json') {
    this.filePath = path.resolve(process.cwd(), storageDir, fileName);
    this.data = {
      users: {},
      usersById: {},
      sessions: {},
      findingOwnerships: {},
      entitlements: {},
      processedWebhooks: {},
    };
    this.loadFromDisk();
  }

  static getInstance(storageDir = 'data', fileName = 'aidiscost-db.json'): ServerStorage {
    if (!ServerStorage.instance) {
      ServerStorage.instance = new ServerStorage(storageDir, fileName);
    }
    return ServerStorage.instance;
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        this.data = {
          users: parsed.users || {},
          usersById: parsed.usersById || {},
          sessions: parsed.sessions || {},
          findingOwnerships: parsed.findingOwnerships || {},
          entitlements: parsed.entitlements || {},
          processedWebhooks: parsed.processedWebhooks || {},
        };
      }
    } catch (err) {
      // If disk read fails, fallback to clean memory store
      console.warn('[ServerStorage] Warning loading disk state:', (err as Error).message);
    }
  }

  private flushToDisk(): void {
    if (this.isTestMode) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmpPath = `${this.filePath}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpPath, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this.filePath);
    } catch (err) {
      console.warn('[ServerStorage] Warning saving disk state:', (err as Error).message);
    }
  }

  setTestMode(isTest: boolean): void {
    this.isTestMode = isTest;
  }

  clearAll(): void {
    this.data = {
      users: {},
      usersById: {},
      sessions: {},
      findingOwnerships: {},
      entitlements: {},
      processedWebhooks: {},
    };
    this.flushToDisk();
  }

  // --- User Operations ---
  async createUser(user: User): Promise<User> {
    const normalizedEmail = user.email.trim().toLowerCase();
    if (this.data.users[normalizedEmail]) {
      throw new Error(`User with email ${normalizedEmail} already exists`);
    }
    this.data.users[normalizedEmail] = user;
    this.data.usersById[user.id] = normalizedEmail;
    this.flushToDisk();
    return user;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.trim().toLowerCase();
    return this.data.users[normalizedEmail] || null;
  }

  async getUserById(id: string): Promise<User | null> {
    const email = this.data.usersById[id];
    if (!email) return null;
    return this.data.users[email] || null;
  }

  // --- Session Operations ---
  async createSession(session: UserSession): Promise<UserSession> {
    this.data.sessions[session.token] = session;
    this.flushToDisk();
    return session;
  }

  async getSession(token: string): Promise<{ session: UserSession; user: User } | null> {
    if (!token) return null;
    const session = this.data.sessions[token];
    if (!session) return null;

    // Check expiration
    if (new Date(session.expires_at).getTime() < Date.now()) {
      delete this.data.sessions[token];
      this.flushToDisk();
      return null;
    }

    const user = await this.getUserById(session.user_id);
    if (!user) {
      delete this.data.sessions[token];
      this.flushToDisk();
      return null;
    }

    return { session, user };
  }

  async deleteSession(token: string): Promise<boolean> {
    if (this.data.sessions[token]) {
      delete this.data.sessions[token];
      this.flushToDisk();
      return true;
    }
    return false;
  }

  // --- Finding Ownership Operations ---
  async registerFindingOwnership(findingId: string, ownerId: string): Promise<FindingOwnership> {
    const existing = this.data.findingOwnerships[findingId];
    if (existing) {
      return existing;
    }
    const record: FindingOwnership = {
      finding_id: findingId,
      owner_id: ownerId,
      created_at: new Date().toISOString(),
    };
    this.data.findingOwnerships[findingId] = record;
    this.flushToDisk();
    return record;
  }

  async getFindingOwner(findingId: string): Promise<string | null> {
    const record = this.data.findingOwnerships[findingId];
    return record ? record.owner_id : null;
  }

  async listUserFindings(ownerId: string): Promise<string[]> {
    return Object.values(this.data.findingOwnerships)
      .filter((fo) => fo.owner_id === ownerId)
      .map((fo) => fo.finding_id);
  }

  // --- Entitlement Operations ---
  private entitlementKey(userId: string, findingId: string): string {
    return `${userId}:${findingId}`;
  }

  async createEntitlement(entitlement: Entitlement): Promise<Entitlement> {
    const key = this.entitlementKey(entitlement.user_id, entitlement.finding_id);
    this.data.entitlements[key] = entitlement;
    this.flushToDisk();
    return entitlement;
  }

  async getEntitlement(userId: string, findingId: string): Promise<Entitlement | null> {
    const key = this.entitlementKey(userId, findingId);
    return this.data.entitlements[key] || null;
  }

  async hasActivePaidEntitlement(userId: string, findingId: string): Promise<boolean> {
    const entitlement = await this.getEntitlement(userId, findingId);
    return Boolean(
      entitlement &&
      entitlement.type === 'PAID_FIX_PACKAGE' &&
      entitlement.status === 'ACTIVE'
    );
  }

  // --- Webhook Idempotency Operations ---
  async isWebhookEventProcessed(eventId: string): Promise<boolean> {
    return Boolean(this.data.processedWebhooks[eventId]);
  }

  async recordProcessedWebhook(event: ProcessedWebhookEvent): Promise<void> {
    this.data.processedWebhooks[event.event_id] = event;
    this.flushToDisk();
  }
}
