export function BiaBackground() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 -z-10 h-full w-full bg-[#080808] bg-[linear-gradient(to_right,rgba(20,86,124,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(20,86,124,0.06)_1px,transparent_1px)] bg-[size:6rem_4rem]"
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle 500px at 30% -50px, rgba(20,86,124,0.2), transparent), radial-gradient(circle 300px at 70% -30px, rgba(251,173,31,0.12), transparent)",
        }}
      />
    </div>
  );
}
