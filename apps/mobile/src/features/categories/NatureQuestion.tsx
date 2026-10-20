import { Text, View } from "react-native";
import { Choice, useUi } from "../../ui/core";
import type { NatureAnswer } from "./model";

const answers: Array<{ value: NatureAnswer; label: string }> = [
  { value: "spend", label: "I spend it" },
  { value: "receive", label: "I receive it" },
  { value: "stillMine", label: "It is still mine" },
  { value: "payDebt", label: "I pay a debt" },
];
export function NatureQuestion({ answer, suggested, allowed, disabled, onAnswer }: {
  answer: NatureAnswer | null;
  suggested: NatureAnswer | null;
  allowed: NatureAnswer[];
  disabled: boolean;
  onAnswer: (answer: NatureAnswer) => void;
}) {
  const ui = useUi();
  return <View style={ui.section}>
    <Text style={ui.title}>What happens to the money?</Text>
    {suggested && <Text style={ui.muted}>Suggested from the name. You can change it.</Text>}
    {answers.filter(({ value }) => allowed.includes(value)).map(({ value, label }) =>
      <Choice key={value} label={label} selected={answer === value}
        disabled={disabled} onPress={() => onAnswer(value)} />)}
  </View>;
}
