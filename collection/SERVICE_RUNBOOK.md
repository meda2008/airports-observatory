# 执行入口已改为独立服务器

用户明确要求线上独立部署，不使用Codex定时任务。之前automation-5已经删除。

部署与运行以deploy-service/README.md为准。collection/scheduled-worker.mjs仅保留为Codex内置浏览器辅助诊断，不是生产调度器。服务器Worker为deploy-service/worker.cjs，事务持久层为deploy-service/store.cjs。
