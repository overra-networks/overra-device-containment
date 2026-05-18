interface FakeSession {
  user: {
    id: string;
    email?: string;
    name?: string;
    walletAddress?: string | null;
    plan?: string;
  };
}

let currentSession: FakeSession | null = null;

export function setSession(userId: string, extras: Partial<FakeSession["user"]> = {}): void {
  currentSession = {
    user: {
      id: userId,
      email: extras.email ?? "test@example.com",
      name: extras.name ?? "Test",
      walletAddress: extras.walletAddress ?? null,
      plan: extras.plan ?? "free",
    },
  };
}

export function clearSession(): void {
  currentSession = null;
}

export function getCurrentSession(): FakeSession | null {
  return currentSession;
}
