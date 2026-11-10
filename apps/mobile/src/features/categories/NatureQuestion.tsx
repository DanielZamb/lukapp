import { Text, View } from "react-native";
import { useT, type MessageKey } from "../../i18n";
import { Choice, useUi } from "../../ui/core";
import type { NatureAnswer } from "./model";

const answers: Array<{ value: NatureAnswer; label: MessageKey }> = [
  { value: "spend", label: "categories.answerSpend" },
  { value: "receive", label: "categories.answerReceive" },
  { value: "stillMine", label: "categories.answerStillMine" },
  { value: "payDebt", label: "categories.answerPayDebt" },
];
export function NatureQuestion({ answer, suggested, allowed, disabled, onAnswer }: {
  answer: NatureAnswer | null;
  suggested: NatureAnswer | null;
  allowed: NatureAnswer[];
  disabled: boolean;
  onAnswer: (answer: NatureAnswer) => void;
}) {
  const ui = useUi();
  const { t } = useT();
  return <View style={ui.section}>
    <Text style={ui.title}>{t("categories.natureQuestion")}</Text>
    {suggested && <Text style={ui.muted}>{t("categories.natureSuggested")}</Text>}
    {answers.filter(({ value }) => allowed.includes(value)).map(({ value, label }) =>
      <Choice key={value} label={t(label)} selected={answer === value}
        disabled={disabled} onPress={() => onAnswer(value)} />)}
  </View>;
}
