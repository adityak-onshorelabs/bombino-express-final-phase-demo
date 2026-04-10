export function BiaBackground() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 -z-10 h-full w-full bg-[#080808] bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:6rem_4rem]"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_600px_at_50%_-50px,rgba(198,40,40,0.18),transparent)]" />
    </div>
  );
}
