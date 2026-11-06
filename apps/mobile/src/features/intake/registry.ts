import type { IntakeService } from "./service";

const services = new Map<string, IntakeService>();
export function registerIntake(subject: string, service: IntakeService) {
  services.get(subject)?.stop();
  services.set(subject, service);
  return () => {
    service.stop();
    if (services.get(subject) === service) services.delete(subject);
  };
}
export function stopIntake(subject: string) {
  services.get(subject)?.stop();
  services.delete(subject);
}
