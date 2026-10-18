//! Offline-dump network diagnostics run from the user machine. Output shape
//! matches `MainNetResult` in `src/platform/native.ts`.

use serde::Serialize;
use std::net::ToSocketAddrs;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::net::TcpStream;
use tokio::time::timeout;

const MAX_HOSTS: usize = 5;
const TRACE_MAX_HOPS: usize = 12;

#[derive(Serialize)]
pub struct DnsCheck {
    host: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    addresses: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    resolvers: Option<Vec<String>>,
    ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Serialize)]
pub struct TcpCheck {
    host: String,
    port: u16,
    ok: bool,
    ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Serialize, Default)]
pub struct TlsCheck {
    host: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    protocol: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    authorized: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    subject: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    issuer: Option<String>,
    ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Serialize)]
pub struct ControlCheck {
    name: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    status: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
    ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Serialize)]
pub struct TraceResult {
    host: String,
    ok: bool,
    hops: Vec<String>,
    ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Serialize)]
pub struct NetResult {
    dns: Vec<DnsCheck>,
    tcp: Vec<TcpCheck>,
    tls: Vec<TlsCheck>,
    controls: Vec<ControlCheck>,
    trace: Option<TraceResult>,
    platform: String,
}

fn is_valid_host(host: &str) -> bool {
    let bytes = host.as_bytes();
    !host.is_empty()
        && host.len() <= 253
        && bytes[0].is_ascii_alphanumeric()
        && bytes[bytes.len() - 1].is_ascii_alphanumeric()
        && bytes.iter().all(|b| b.is_ascii_alphanumeric() || *b == b'.' || *b == b'-')
}

fn short(err: impl ToString) -> String {
    err.to_string().chars().take(120).collect()
}

fn elapsed(start: Instant) -> u64 {
    start.elapsed().as_millis() as u64
}

fn system_resolvers() -> Option<Vec<String>> {
    let conf = std::fs::read_to_string("/etc/resolv.conf").ok()?;
    let servers: Vec<String> = conf
        .lines()
        .filter_map(|line| line.trim().strip_prefix("nameserver"))
        .map(|rest| rest.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    (!servers.is_empty()).then_some(servers)
}

async fn check_dns(host: String, resolvers: Option<Vec<String>>) -> DnsCheck {
    let start = Instant::now();
    let lookup_host = host.clone();
    let result = tokio::task::spawn_blocking(move || (lookup_host.as_str(), 443).to_socket_addrs())
        .await
        .map_err(short)
        .and_then(|r| r.map_err(short));
    match result {
        Ok(mut addrs) => DnsCheck {
            host,
            ok: true,
            addresses: addrs.next().map(|a| vec![a.ip().to_string()]),
            resolvers,
            ms: elapsed(start),
            error: None,
        },
        Err(error) => DnsCheck { host, ok: false, addresses: None, resolvers, ms: elapsed(start), error: Some(error) },
    }
}

async fn check_tcp(host: String) -> TcpCheck {
    let start = Instant::now();
    let error = match timeout(Duration::from_secs(5), TcpStream::connect((host.as_str(), 443))).await {
        Ok(Ok(_)) => None,
        Ok(Err(err)) => Some(short(err)),
        Err(_) => Some("timed out".into()),
    };
    TcpCheck { host, port: 443, ok: error.is_none(), ms: elapsed(start), error }
}

/// Accepts any certificate but records whether webpki would have trusted it:
/// a captive portal or MITM proxy still answers, and its untrusted cert is
/// exactly the evidence support needs.
#[derive(Debug)]
struct RecordingVerifier {
    inner: Arc<rustls::client::WebPkiServerVerifier>,
    authorized: std::sync::Mutex<Option<bool>>,
}

impl rustls::client::danger::ServerCertVerifier for RecordingVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &rustls::pki_types::CertificateDer<'_>,
        intermediates: &[rustls::pki_types::CertificateDer<'_>],
        server_name: &rustls::pki_types::ServerName<'_>,
        ocsp_response: &[u8],
        now: rustls::pki_types::UnixTime,
    ) -> Result<rustls::client::danger::ServerCertVerified, rustls::Error> {
        let trusted = self
            .inner
            .verify_server_cert(end_entity, intermediates, server_name, ocsp_response, now)
            .is_ok();
        *self.authorized.lock().unwrap() = Some(trusted);
        Ok(rustls::client::danger::ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &rustls::pki_types::CertificateDer<'_>,
        dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        self.inner.verify_tls12_signature(message, cert, dss)
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &rustls::pki_types::CertificateDer<'_>,
        dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        self.inner.verify_tls13_signature(message, cert, dss)
    }

    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        self.inner.supported_verify_schemes()
    }
}

fn cert_names(der: &[u8]) -> (Option<String>, Option<String>) {
    let Ok((_, cert)) = x509_parser::parse_x509_certificate(der) else {
        return (None, None);
    };
    let first = |name: &x509_parser::x509::X509Name, oid_cn: bool| {
        let attr = if oid_cn { name.iter_common_name().next() } else { name.iter_organization().next() };
        attr.and_then(|a| a.as_str().ok()).map(short)
    };
    let subject = first(cert.subject(), true);
    let issuer = first(cert.issuer(), false).or_else(|| first(cert.issuer(), true));
    (subject, issuer)
}

async fn check_tls(host: String) -> TlsCheck {
    let start = Instant::now();
    let fail = |host: String, error: String| TlsCheck { host, ok: false, ms: elapsed(start), error: Some(error), ..Default::default() };

    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let roots = Arc::new(rustls::RootCertStore { roots: webpki_roots::TLS_SERVER_ROOTS.to_vec() });
    let inner = match rustls::client::WebPkiServerVerifier::builder_with_provider(roots, provider.clone()).build() {
        Ok(v) => v,
        Err(err) => return fail(host, short(err)),
    };
    let verifier = Arc::new(RecordingVerifier { inner, authorized: Default::default() });
    let config = match rustls::ClientConfig::builder_with_provider(provider).with_safe_default_protocol_versions() {
        Ok(b) => b.dangerous().with_custom_certificate_verifier(verifier.clone()).with_no_client_auth(),
        Err(err) => return fail(host, short(err)),
    };
    let Ok(server_name) = rustls::pki_types::ServerName::try_from(host.clone()) else {
        return fail(host, "invalid server name".into());
    };

    let connector = tokio_rustls::TlsConnector::from(Arc::new(config));
    let handshake = async {
        let tcp = TcpStream::connect((host.as_str(), 443)).await?;
        connector.connect(server_name, tcp).await
    };
    match timeout(Duration::from_secs(5), handshake).await {
        Ok(Ok(stream)) => {
            let (_, session) = stream.get_ref();
            let protocol = session.protocol_version().map(|v| match v {
                rustls::ProtocolVersion::TLSv1_3 => "TLSv1.3".to_string(),
                rustls::ProtocolVersion::TLSv1_2 => "TLSv1.2".to_string(),
                other => format!("{other:?}"),
            });
            let (subject, issuer) = session
                .peer_certificates()
                .and_then(|certs| certs.first())
                .map(|c| cert_names(c.as_ref()))
                .unwrap_or_default();
            let authorized = *verifier.authorized.lock().unwrap();
            TlsCheck { host, ok: true, protocol, authorized, subject, issuer, ms: elapsed(start), error: None }
        }
        Ok(Err(err)) => fail(host, short(err)),
        Err(_) => fail(host, "timed out".into()),
    }
}

async fn fetch_control(
    client: &reqwest::Client,
    name: &str,
    url: &str,
    pick: Option<fn(&str) -> Option<String>>,
) -> ControlCheck {
    let start = Instant::now();
    match client.get(url).send().await {
        Ok(res) => {
            let status = res.status().as_u16();
            let body = res.text().await.unwrap_or_default();
            let body: String = body.chars().take(2048).collect();
            ControlCheck {
                name: name.into(),
                ok: status < 400,
                status: Some(status),
                detail: pick.and_then(|f| f(&body)),
                ms: elapsed(start),
                error: None,
            }
        }
        Err(err) => ControlCheck {
            name: name.into(),
            ok: false,
            status: None,
            detail: None,
            ms: elapsed(start),
            error: Some(short(if err.is_timeout() { "timed out".to_string() } else { err.to_string() })),
        },
    }
}

/// Egress fingerprint for support: exit ip and colo, nothing else.
fn cloudflare_trace_detail(body: &str) -> Option<String> {
    let field = |key: &str| {
        body.lines()
            .find_map(|l| l.strip_prefix(key).and_then(|v| v.strip_prefix('=')))
            .map(|v| v.trim().to_string())
    };
    match (field("ip"), field("loc")) {
        (Some(ip), Some(loc)) => Some(format!("ip {ip} · {loc}")),
        (Some(ip), None) => Some(format!("ip {ip}")),
        (None, loc) => loc,
    }
}

/// Mirrors `parseTraceOutput`: drops the tool header, keeps raw hop lines.
fn parse_trace_output(stdout: &str) -> Vec<String> {
    stdout
        .lines()
        .map(|line| line.trim().chars().take(160).collect::<String>())
        .filter(|line| !line.is_empty())
        .filter(|line| {
            let lower = line.to_lowercase();
            !["traceroute to", "tracepath", "tracing route", "over a maximum"]
                .iter()
                .any(|p| lower.starts_with(p))
        })
        .take(TRACE_MAX_HOPS + 2)
        .collect()
}

async fn run_trace(host: String) -> TraceResult {
    let start = Instant::now();
    let hops = TRACE_MAX_HOPS.to_string();
    let mut cmd = if cfg!(windows) {
        let mut c = tokio::process::Command::new("tracert");
        c.args(["-d", "-w", "1000", "-h", &hops, &host]);
        c
    } else {
        let mut c = tokio::process::Command::new("traceroute");
        c.args(["-n", "-w", "1", "-q", "1", "-m", &hops, &host]);
        c
    };
    cmd.kill_on_drop(true);
    match timeout(Duration::from_secs(30), cmd.output()).await {
        Ok(Ok(output)) => {
            let hops = parse_trace_output(&String::from_utf8_lossy(&output.stdout));
            let error = (!output.status.success()).then(|| short(format!("exit {}", output.status)));
            TraceResult { host, ok: !hops.is_empty(), hops, ms: elapsed(start), error }
        }
        Ok(Err(err)) if err.kind() == std::io::ErrorKind::NotFound => TraceResult {
            host,
            ok: false,
            hops: vec![],
            ms: elapsed(start),
            error: Some("traceroute not installed".into()),
        },
        Ok(Err(err)) => TraceResult { host, ok: false, hops: vec![], ms: elapsed(start), error: Some(short(err)) },
        Err(_) => TraceResult { host, ok: false, hops: vec![], ms: elapsed(start), error: Some("ETIMEDOUT".into()) },
    }
}

/// Hosts come from the renderer, so they are re-validated here.
#[tauri::command]
pub async fn diagnose_network(hosts: Vec<String>) -> NetResult {
    let list: Vec<String> = hosts.into_iter().filter(|h| is_valid_host(h)).take(MAX_HOSTS).collect();
    let resolvers = system_resolvers();

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(6))
        .user_agent("wave-connectivity/1.0")
        .build()
        .unwrap_or_default();

    let dns = futures_join_all(list.iter().map(|h| check_dns(h.clone(), resolvers.clone()))).await;
    let tcp = futures_join_all(list.iter().map(|h| check_tcp(h.clone()))).await;
    let tls = futures_join_all(list.iter().map(|h| check_tls(h.clone()))).await;
    let (google, cloudflare) = tokio::join!(
        fetch_control(&client, "google", "https://www.google.com/generate_204", None),
        fetch_control(&client, "cloudflare", "https://cloudflare.com/cdn-cgi/trace", Some(cloudflare_trace_detail)),
    );
    let trace = match list.first() {
        Some(host) => Some(run_trace(host.clone()).await),
        None => None,
    };

    NetResult {
        dns,
        tcp,
        tls,
        controls: vec![google, cloudflare],
        trace,
        platform: format!("{} {}", std::env::consts::OS, std::env::consts::ARCH),
    }
}

async fn futures_join_all<F: std::future::Future>(futures: impl Iterator<Item = F>) -> Vec<F::Output>
where
    F: Send + 'static,
    F::Output: Send + 'static,
{
    let handles: Vec<_> = futures.map(tauri::async_runtime::spawn).collect();
    let mut out = Vec::with_capacity(handles.len());
    for handle in handles {
        if let Ok(value) = handle.await {
            out.push(value);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_hosts() {
        assert!(is_valid_host("wave.wms"));
        assert!(!is_valid_host("-bad.com"));
        assert!(!is_valid_host("evil.com/../x"));
        assert!(!is_valid_host(""));
    }

    #[test]
    fn parses_trace_output() {
        let out = "traceroute to x (1.2.3.4), 12 hops max\n 1  192.168.1.1  1.0 ms\n\n 2  * \n";
        assert_eq!(parse_trace_output(out), vec!["1  192.168.1.1  1.0 ms", "2  *"]);
    }

    #[test]
    fn extracts_cloudflare_detail() {
        assert_eq!(cloudflare_trace_detail("fl=1\nip=1.2.3.4\nloc=DE\n").as_deref(), Some("ip 1.2.3.4 · DE"));
        assert_eq!(cloudflare_trace_detail("nothing").as_deref(), None);
    }
}
