export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "48px 40px", maxWidth: "560px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
        <div style={{ width: "30px", height: "30px", background: "#d4a83a", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "#0d2240", fontSize: "10px", fontWeight: "700" }}>1LM</span>
        </div>
        <h1 style={{ fontSize: "20px", fontWeight: "500", color: "#0d2240", margin: 0 }}>OneLM</h1>
      </div>
      <p style={{ color: "#666", fontSize: "14px", marginBottom: "28px", marginTop: "4px" }}>
        AI case assistant for personal injury firms. Backend is running.
      </p>
      <div style={{ background: "#f5f3ef", borderRadius: "10px", padding: "16px 18px" }}>
        <p style={{ fontSize: "11px", fontWeight: "500", color: "#0d2240", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 12px" }}>API routes</p>
        {[
          ["POST", "/api/cases",         "Create and manage clients"],
          ["POST", "/api/upload",        "Upload case documents"],
          ["POST", "/api/chat",          "AI chat for a case"],
          ["POST", "/api/summary",       "Generate case summary"],
          ["GET",  "/api/tickets",       "Support task tickets"],
          ["GET",  "/api/milestones",    "Case milestone checklist"],
          ["GET",  "/api/teams",         "Manage teams"],
          ["GET",  "/api/notifications", "User notifications"],
        ].map(([method, path, desc]) => (
          <div key={path} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "7px 0", borderBottom: "0.5px solid #d9d4c8" }}>
            <span style={{ fontSize: "10px", fontWeight: "600", padding: "2px 6px", borderRadius: "4px", background: method === "POST" ? "#e8eef5" : "#E1F5EE", color: method === "POST" ? "#0d2240" : "#085041", minWidth: "34px", textAlign: "center" }}>{method}</span>
            <code style={{ fontSize: "12px", color: "#0d2240", flex: 1 }}>{path}</code>
            <span style={{ fontSize: "11px", color: "#999" }}>{desc}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
