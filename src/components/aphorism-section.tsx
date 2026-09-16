import { getAphorismOfTheDay } from "@/lib/aphorism";

export function AphorismSection() {
  const aphorism = getAphorismOfTheDay();

  return (
    <aside className="aphorism" aria-label="Aforisma del giorno">
      <blockquote className="aphorism__quote">
        <p className="aphorism__text">«{aphorism.text}»</p>
      </blockquote>
    </aside>
  );
}
