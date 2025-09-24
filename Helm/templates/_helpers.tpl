{{/*
展開 chart 的名稱。
*/}}
{{- define "deno-web-app.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
創建完全限定的應用程式名稱。
我們截斷到 63 個字符，因為某些 Kubernetes 名稱字段受到此限制（通過 DNS 命名規範）。
如果 release 名稱包含 chart 名稱，它將被用作完全限定名稱。
*/}}
{{- define "deno-web-app.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
創建 chart 名稱和版本，作為 chart 標籤使用。
*/}}
{{- define "deno-web-app.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
通用標籤
*/}}
{{- define "deno-web-app.labels" -}}
helm.sh/chart: {{ include "deno-web-app.chart" . }}
{{ include "deno-web-app.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
選擇器標籤
*/}}
{{- define "deno-web-app.selectorLabels" -}}
app.kubernetes.io/name: {{ include "deno-web-app.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
創建服務帳戶的名稱
*/}}
{{- define "deno-web-app.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "deno-web-app.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
映像標籤
*/}}
{{- define "deno-web-app.imageTag" -}}
{{- .Values.image.tag | default .Chart.AppVersion }}
{{- end }}
