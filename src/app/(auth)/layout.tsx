import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-bg)",
        padding: "1rem",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Flat geometric background decoration — no gradients, low-opacity solids */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "-10rem",
          right: "-8rem",
          width: "28rem",
          height: "28rem",
          borderRadius: "50%",
          background: "var(--color-primary)",
          opacity: 0.08,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          bottom: "-12rem",
          left: "-8rem",
          width: "26rem",
          height: "26rem",
          borderRadius: "50%",
          background: "var(--color-secondary)",
          opacity: 0.08,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "18%",
          left: "-5rem",
          width: "14rem",
          height: "14rem",
          transform: "rotate(45deg)",
          background: "var(--color-accent)",
          opacity: 0.08,
        }}
      />

      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );
}