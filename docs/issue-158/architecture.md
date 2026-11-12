# architecture

## 今回の構成（Issue #158、コスト最小化・単一障害点あり）

```mermaid
flowchart TB
    subgraph Internet["インターネット"]
        User["利用者のブラウザ"]
        Operator["作業者（踏み台SSH接続元IP）"]
    end

    subgraph CF["CloudFront（グローバル、Price Class 100）"]
        CFDist["ディストリビューション\ndefault: /* → S3\n/api/*, /auth/* → ALB"]
    end

    User -->|HTTPS| CFDist

    subgraph AWS["AWSアカウント（ap-northeast-1）"]
        S3["S3\nnaw-fastapi-issue158-frontend\n(frontend-angularビルド成果物)"]
        CFDist -->|OAC経由| S3

        subgraph VPC["VPC 10.0.0.0/16（パブリックサブネット×2: 10.0.1.0/24・10.0.2.0/24、AZは自動選択のため図では区別しない）"]
            ALB["ALB\nHTTPS (sslip.io + Let's Encrypt証明書)"]
            ECSHost["ECS EC2ホスト t4g.nano\nbackend (FastAPI) コンテナ"]
            Bastion["踏み台 EC2 t4g.nano"]
            RDS["RDS PostgreSQL\ndb.t4g.micro, Single-AZ\nパブリックアクセス無効"]
            Redis["ElastiCache for Redis\ncache.t4g.micro"]
            IGW["Internet Gateway"]
        end

        ECR["ECR\nnaw-fastapi-issue158-backend"]
    end

    CFDist -->|"/api/*, /auth/*\n(HTTPS)"| ALB
    ALB --> ECSHost
    ECSHost -->|5432| RDS
    ECSHost -->|6379| Redis
    ECR -.->|image pull| ECSHost
    Operator -->|SSH 22| Bastion
    Bastion -->|5432| RDS
    VPC --- IGW
```

- 実線: アプリケーションの通信経路
- 点線: イメージのpull等、随時発生する通信
- プライベートサブネットは作らず、パブリックサブネットのみでNAT Gatewayを不要にしている（詳細は`02_基本設計.md`「ネットワーク構成の方針」参照）
- セキュリティグループの詳細なルールは`02_基本設計.md`「ネットワーク構成の方針」章を参照
- ALB以外はすべて単一インスタンス（ECS 1台・RDS Single-AZ・ElastiCacheレプリカ0・踏み台1台）で、冗長性はない

---

## ベストプラクティス構成（本番相当・参考）

今回は採用していないが、本番環境であれば一般的にこうする、という構成の参考図。マルチAZ冗長化・プライベートサブネット化・NAT Gateway・踏み台の代わりにSSM Session Managerを使う、といった違いがある。

```mermaid
flowchart TB
    subgraph Internet["インターネット"]
        User["利用者のブラウザ"]
        Operator["作業者（SSM Session Manager経由、SSH鍵不要）"]
    end

    subgraph CF["CloudFront"]
        CFDist["ディストリビューション\ndefault: /* → S3\n/api/*, /auth/* → ALB"]
    end

    User -->|HTTPS| CFDist

    subgraph AWS["AWSアカウント（ap-northeast-1）"]
        S3["S3（frontend静的ホスティング）"]
        CFDist --> S3

        subgraph VPC["VPC"]
            ALB["ALB（2AZにまたがる、ACM証明書でHTTPS終端）"]

            subgraph AZ1["AZ: ap-northeast-1a"]
                subgraph Pub1["パブリックサブネット"]
                    NAT1["NAT Gateway"]
                end
                subgraph Priv1["プライベートサブネット"]
                    ECS1["ECSタスク #1"]
                    RDSPrimary["RDS プライマリ\nMulti-AZ"]
                    RedisPrimary["ElastiCache プライマリ"]
                end
            end

            subgraph AZ2["AZ: ap-northeast-1c"]
                subgraph Pub2["パブリックサブネット"]
                    NAT2["NAT Gateway"]
                end
                subgraph Priv2["プライベートサブネット"]
                    ECS2["ECSタスク #2"]
                    RDSStandby["RDS スタンバイ\n自動フェイルオーバー"]
                    RedisReplica["ElastiCache レプリカ"]
                end
            end

            IGW["Internet Gateway"]
        end

        ECR["ECR"]
        SSM["AWS Systems Manager\n(Session Manager)"]
    end

    CFDist -->|/api/*, /auth/*| ALB
    ALB --> ECS1
    ALB --> ECS2
    ECS1 -->|5432| RDSPrimary
    ECS2 -->|5432| RDSPrimary
    RDSPrimary -.->|同期レプリケーション| RDSStandby
    ECS1 -->|6379| RedisPrimary
    ECS2 -->|6379| RedisPrimary
    RedisPrimary -.->|レプリケーション| RedisReplica
    ECR -.->|image pull（NAT経由 or VPCエンドポイント）| ECS1
    ECR -.->|image pull（NAT経由 or VPCエンドポイント）| ECS2
    Priv1 -->|アウトバウンドのみ| NAT1
    Priv2 -->|アウトバウンドのみ| NAT2
    NAT1 --> IGW
    NAT2 --> IGW
    Operator -->|IAM認証、SSHポート開放不要| SSM
    SSM -.-> ECS1
```

### 今回の構成との主な違い

| 観点 | 今回（Issue #158） | ベストプラクティス（本番相当） |
|---|---|---|
| ECS | 1台のみ | 2AZに複数タスクを分散 |
| RDS | Single-AZ | Multi-AZ（自動フェイルオーバー） |
| ElastiCache | レプリカ0 | レプリカあり（別AZ） |
| サブネット | パブリックのみ | パブリック（ALB/NAT）＋プライベート（アプリ/DB） |
| NAT Gateway | なし | 各AZに1つ（アウトバウンド用） |
| 管理アクセス | 踏み台EC2 + SSHキーペア | SSM Session Manager（SSHポート開放不要） |
| コスト | 検証1回あたり数十〜200円 | 月額数万円規模（NAT Gateway・Multi-AZ・複数台構成のため） |
