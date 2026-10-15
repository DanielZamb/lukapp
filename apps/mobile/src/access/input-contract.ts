export interface LocalInputCustody {
  inputPut(owner: "draft" | "candidate", id: string, content: string, generation: number): Promise<void>;
  inputList(owner: "draft" | "candidate", generation: number): Promise<string[]>;
  inputDelete(owner: "draft" | "candidate", id: string, generation: number): Promise<void>;
}
