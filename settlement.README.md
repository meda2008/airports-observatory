# 离线预测结算

工具只复算明确的契约与算术，不联网，不改原预测，不证明来源真实、可信时间戳或人员独立。原始证据和独立人工复核仍须另行完成。当前245条全为弃判，Brier应为null；不能将没有预测记为0分。

```powershell
node settle-ledger.cjs --ledger data/public-ledger.json --adjudications data/adjudications.empty.json --as-of 2026-10-26T00:00:00+08:00 --output settlement-20261026.json
```

输出文件必须是新文件，脚本不会覆盖已有报告。传入as-of是复算时点，不是修改预测做出日期。输入文件字节哈希和规范化内容哈希分别记录；报告可重复产生相同算术结果。原始台账公开投影不能独立重算原链，工具不会宣称已验证该链。

纯函数导出`settleLedger(ledger, adjudications, {asOf, binCount, minCalibrationBinSize})`。两个输入均可为数组或带`items`的对象。没有数值预测时，其他预测字段的缺口继续保留，弃判不进入评分。

未来数值预测必须在冻结条目中明确给出以下字段，不能事后补点概率来参加历史评分：

- `forecastId`、`recordId`、`version`、`status="issued"`、`issuedAt`、`horizonEnd`、`adjudicationNotBefore`。
- `target`必须是`NO_ADJUDICATED_MATERIAL_SERVICE_CESSATION_WITHIN_HORIZON`。点概率为期限内没有经裁决的重大核心服务停止的概率，不是官网HTTP可达率。
- `outcomeDefinition`必须事前写明重大核心服务停止的操作定义，包括持续时长、影响范围及恢复如何处理；该文本纳入预测哈希。非空检查不能证明定义充分，独立裁决人还须确认其可判定性，不能事后换定义。
- `pointProbability`在0至1之间；`probabilityRecordedAt`不晚于`issuedAt`。区间不得自动取中点替代点预测。
- `modelerIds`列出参与建模的身份，`sourceIds`列出判断依据的来源。空列表不可评分。
- `freeze.recordedAt`不晚于`issuedAt`；`freeze.forecastSha256`必须等于导出函数`forecastFingerprint(entry)`对明确预测字段的规范化SHA256。`freeze.evidence`须有原始公开`url`、留存字节`sha256`和不晚于做出日期的`observedAt`。这些声明和哈希仍须由独立人追溯，并非脚本认证的时间戳。
- 冻结预测中不得包含已填写的`outcome`、`result`、`resolvedAt`或`brierContribution`，结果放在另一个裁决文件。

裁决文件每项通过`forecastId`和`forecastSha256`绑定做出时的预测。数值结果需要以下字段：

- `result`为`survived`或`ceased`；分别映射1和0。`unknown`、`lost_to_followup`单列，不填为存活或停服。
- `observedAt`为结果观察时间，`adjudicatedAt`为裁决时间，均有时区；裁决不早于预定结算日期，不晚于复算时点，观察不晚于裁决。
- `adjudicator.id`不在`modelerIds`中，`didNotParticipateInModeling=true`及`noDeclaredConflictOfInterest=true`。别名、实际参与和利益关系仍须人工核查，换一个字符串不构成真正独立。
- `evidence`非空，每项有公开`url`、保留字节`sha256`、`observedAt`。脚本不下载也不替代证据溯源。
- 存活需要`coverageFrom`不晚于预测起点、`coverageThrough`不早于期限终点且不晚于观察时间；重大停止需要`eventAt`落在预测期限内且不晚于观察。覆盖时间只是裁决人的可核查声明，不能把末日一次访问自动算作全期限存活。

输出逐项区分ABSTAIN、NOT_DUE、UNKNOWN_OUTCOME、LOST_TO_FOLLOWUP、INVALID_FORECAST、INVALID_ADJUDICATION、SCORED。即使已经收到结果，也不会在预定结算期前结算。只有SCORED参与Brier和可靠性分箱，且同时展示其余分母。

可靠性曲线每箱给出样本数、平均预测、实际存活比例和平方误差；空箱数值为null。默认少于30条标小样本，这是可配置提示，绝非充分性定理。达到30条也不能证明校准、独立抽样或样本无偏。不同目标/期限另列cohort，避免总体平均掩盖差异。

测试中的数字、身份、日期、URL和结果全部为明确标记的synthetic测试夹具，不是机场事实或历史回测。
