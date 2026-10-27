type NamedUser = { name?: string; nickname?: string; email?: string };

export function displayName(u: NamedUser): string {
  return (u.nickname || u.name || (u.email ? u.email.split("@")[0] : "") || "Hiệp sĩ").slice(0, 40);
}
