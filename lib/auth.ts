import type { NextAuthOptions, User, Session } from "next-auth"
import type { JWT } from "next-auth/jwt"
import CredentialsProvider from "next-auth/providers/credentials"
import pool from "@/lib/db"
import bcrypt from "bcryptjs"
import { logEvent } from "@/lib/audit"

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials): Promise<User | null> {
        if (!credentials?.username || !credentials?.password) return null

        try {
          const result = await pool.query(
            "SELECT * FROM public.users WHERE username = $1",
            [credentials.username]
          )

          const row = result.rows[0]
          if (!row) return null

          const passwordMatch = await bcrypt.compare(
            credentials.password,
            row.password_hash
          )
          if (!passwordMatch) return null

          // Log successful login (fire-and-forget)
          logEvent(
            "login",
            { id: row.id, username: row.username },
            `${row.role === "admin" ? "Admin" : "Cashier"} "${row.username}" (${row.name}) logged in`
          )

          return {
            id: row.id.toString(),
            name: row.name,
            username: row.username,
            role: row.role,
          }
        } catch (error) {
          console.error("Auth error:", error)
          const e = error as NodeJS.ErrnoException & { code?: string }
          const isConnectionError =
            e.code === "ECONNREFUSED" ||
            e.code === "ETIMEDOUT" ||
            e.code === "ENOTFOUND" ||
            e.code === "ECONNRESET" ||
            (typeof e.message === "string" &&
              (e.message.toLowerCase().includes("timeout") ||
                e.message.toLowerCase().includes("connect")))
          if (isConnectionError) {
            throw new Error("DatabaseUnavailable")
          }
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }: { token: JWT; user?: User }) {
      if (user) {
        token.role = user.role
        token.id = user.id
        token.username = user.username
      }
      return token
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      if (session.user) {
        session.user.role = token.role
        session.user.id = token.id
        session.user.username = token.username
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  secret: process.env.NEXTAUTH_SECRET,
}
