import { LocalInputLease } from "../local-auth/localInput";
import { addDiscardNotice as writeAdmittedNotice, type DiscardNotice } from "./localDiscardNotices";

export function addDiscardNotice(subject: string, input: DiscardNotice) {
  return writeAdmittedNotice(new LocalInputLease(subject, "notice-test"), subject, input);
}
