/** Flag UMP: mostrar “Cambiar consentimiento” solo si REQUIRED (GDPR / US). */
let privacyOptionsRequired = false;

export function setPrivacyOptionsRequired(value: boolean): void {
  privacyOptionsRequired = value;
}

export function isPrivacyOptionsRequired(): boolean {
  return privacyOptionsRequired;
}
