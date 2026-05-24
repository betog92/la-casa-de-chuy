import { pluralizeLoyalty } from "@/utils/loyalty";

type LoyaltyCongratulationsBannerProps = {
  pointsEarned: number;
  levelChanged?: boolean;
  newLevelName?: string | null;
};

/**
 * Aviso de monedas y subida de nivel tras confirmar (usuario con sesión).
 */
export function LoyaltyCongratulationsBanner({
  pointsEarned,
  levelChanged = false,
  newLevelName,
}: LoyaltyCongratulationsBannerProps) {
  const showCoins = pointsEarned > 0;
  const showLevelUp = levelChanged && Boolean(newLevelName?.trim());

  if (!showCoins && !showLevelUp) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-6 w-full rounded-xl border border-green-200 bg-green-50 p-4 sm:p-5"
    >
      <p className="text-base font-semibold text-green-900 sm:text-lg">
        <span className="mr-1.5" aria-hidden>
          🎉
        </span>
        ¡Felicidades!
      </p>

      <ul className="mt-2.5 space-y-1.5 text-sm text-green-800 sm:text-[0.9375rem]">
        {showCoins && (
          <li>
            Ganaste{" "}
            <span className="font-semibold text-green-900">
              {pointsEarned} {pluralizeLoyalty(pointsEarned)}
            </span>
            .
          </li>
        )}
        {showLevelUp && (
          <li>
            <span className="font-semibold text-green-900">
              ¡Subiste de nivel!
            </span>{" "}
            Ahora eres:{" "}
            <span className="font-semibold text-green-900">{newLevelName}</span>
          </li>
        )}
      </ul>
    </div>
  );
}
