/* eslint-disable @next/next/no-img-element, @next/next/no-html-link-for-pages */
export type SessionUser = { name: string; picture: string | null } | null;

// Auth routes are handled by the Auth0 proxy, so they must be plain <a> links, not <Link>.
export default function UserSlot({ user }: { user: SessionUser }) {
  if (!user) {
    return (
      <span className="user-slot">
        <a className="btn small" href="/auth/login">Đăng nhập</a>
      </span>
    );
  }
  return (
    <span className="user-slot">
      {user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" /> : null}
      <span className="uname">{user.name}</span>
      <a className="btn ghost small" href="/auth/logout">Đăng xuất</a>
    </span>
  );
}
