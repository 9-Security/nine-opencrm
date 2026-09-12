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
        const email = String(credentials?.email ?? '')
          .trim()
          .toLowerCase();
        const password = String(credentials?.password ?? '');
        if (email && password) {
          const leftover = await readLoginChallengeCookie();
          if (leftover) {
            await authRepo.invalidateLoginChallenge(leftover);
            await clearLoginChallengeCookie();
          }
          const user = await authRepo.completePasswordLogin(email, password);
          if (!user) return null;
          return { id: user.id, email: user.email, name: user.name };
        }

        const ticket = await readLoginChallengeCookie();
        if (!ticket) return null;
        const user = await authRepo.consumeLoginChallenge(ticket);
        if (!user) return null;
        await clearLoginChallengeCookie();
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
});
