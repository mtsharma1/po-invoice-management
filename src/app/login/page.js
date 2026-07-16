export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-card">
        <p className="eyebrow">Secure Access</p>
        <h1>Sign in</h1>
        <form className="form-stack" action="/dashboard">
          <label>
            User ID
            <input name="userId" autoComplete="username" />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" />
          </label>
          <button className="btn" type="submit">Open Dashboard</button>
        </form>
      </section>
    </main>
  );
}
