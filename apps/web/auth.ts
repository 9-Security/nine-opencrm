import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authRepo } from '@crm/db';
import { authConfig } from './auth.config';
import { clearLoginChallengeCookie, readLoginChallengeCookie } from '@/lib/auth-cookies';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        challenge: { label: 'Challenge', type: 'text' },
      },
      async authorize(credentials) {
        const ticket = await readLoginChallengeCookie();
        if (ticket) {
          const user = await authRepo.consumeLoginChallenge(ticket);
          if (user) {
            await clearLoginChallengeCookie();
            return { id: user.id, email: user.email, name: user.name };
          }
        }
        const email = String(credentials?.email ?? '')
          .trim()
          .toLowerCase();
        const password = String(credentials?.password ?? '');
        if (!email || !password) return null;
        const result = await authRepo.verifyFirstFactor(email, password);
        if (!result) return null;
        if (result.user.totpEnabled) return null;
        return {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
        };
      },
    }),
  ],
});
