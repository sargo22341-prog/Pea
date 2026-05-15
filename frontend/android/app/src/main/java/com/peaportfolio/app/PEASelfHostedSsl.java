package com.peaportfolio.app;

import android.annotation.SuppressLint;
import android.net.Uri;
import android.util.Log;
import java.net.Socket;
import java.security.SecureRandom;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.util.Collections;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLEngine;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSession;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509ExtendedTrustManager;
import javax.net.ssl.X509TrustManager;

final class PEASelfHostedSsl {
  private static final String TAG = "PEA_SSL";
  private static final Set<String> allowedBackendHosts = Collections.newSetFromMap(new ConcurrentHashMap<>());
  private static boolean installed = false;

  private PEASelfHostedSsl() {}

  static synchronized void install() {
    if (installed) return;

    try {
      X509TrustManager defaultTrustManager = defaultTrustManager();
      HostnameVerifier defaultHostnameVerifier = HttpsURLConnection.getDefaultHostnameVerifier();
      SSLContext sslContext = SSLContext.getInstance("TLS");
      sslContext.init(null, new TrustManager[] { new BackendScopedTrustManager(defaultTrustManager) }, new SecureRandom());
      HttpsURLConnection.setDefaultSSLSocketFactory(sslContext.getSocketFactory());
      HttpsURLConnection.setDefaultHostnameVerifier((hostname, session) -> verifyHostname(defaultHostnameVerifier, hostname, session));
      installed = true;
      Log.w(TAG, "Self-hosted HTTPS trust manager installed. Invalid certificates are accepted only for configured backend hostnames.");
    } catch (Exception error) {
      Log.e(TAG, "Unable to install self-hosted HTTPS trust manager.", error);
    }
  }

  static void allowBackendUrl(String value) {
    try {
      String hostname = normalizeHost(Uri.parse(value).getHost());
      if (hostname == null) {
        Log.w(TAG, "Backend SSL hostname not configured: invalid URL " + value);
        return;
      }
      allowedBackendHosts.add(hostname);
      Log.w(TAG, "Backend SSL hostname allowed: " + hostname);
    } catch (Exception error) {
      Log.e(TAG, "Unable to configure backend SSL hostname from URL.", error);
    }
  }

  static boolean isAllowedHost(String hostname) {
    String normalized = normalizeHost(hostname);
    return normalized != null && allowedBackendHosts.contains(normalized);
  }

  private static boolean verifyHostname(HostnameVerifier defaultVerifier, String hostname, SSLSession session) {
    if (isAllowedHost(hostname)) {
      Log.w(TAG, "HTTPS hostname accepted for configured self-hosted backend: " + normalizeHost(hostname));
      return true;
    }

    boolean verified = defaultVerifier.verify(hostname, session);
    if (!verified) {
      Log.w(TAG, "HTTPS hostname refused: " + hostname);
    }
    return verified;
  }

  private static String normalizeHost(String hostname) {
    if (hostname == null) return null;
    String normalized = hostname.trim().toLowerCase();
    return normalized.isEmpty() ? null : normalized;
  }

  private static X509TrustManager defaultTrustManager() throws Exception {
    TrustManagerFactory factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
    factory.init((java.security.KeyStore) null);
    for (TrustManager trustManager : factory.getTrustManagers()) {
      if (trustManager instanceof X509TrustManager) {
        return (X509TrustManager) trustManager;
      }
    }
    throw new IllegalStateException("No default X509TrustManager available.");
  }

  private static final class BackendScopedTrustManager extends X509ExtendedTrustManager {
    private final X509TrustManager delegate;

    BackendScopedTrustManager(X509TrustManager delegate) {
      this.delegate = delegate;
    }

    @Override
    public void checkClientTrusted(X509Certificate[] chain, String authType) throws CertificateException {
      delegate.checkClientTrusted(chain, authType);
    }

    @Override
    public void checkClientTrusted(X509Certificate[] chain, String authType, Socket socket) throws CertificateException {
      delegate.checkClientTrusted(chain, authType);
    }

    @Override
    public void checkClientTrusted(X509Certificate[] chain, String authType, SSLEngine engine) throws CertificateException {
      delegate.checkClientTrusted(chain, authType);
    }

    @Override
    public void checkServerTrusted(X509Certificate[] chain, String authType) throws CertificateException {
      delegate.checkServerTrusted(chain, authType);
    }

    @Override
    @SuppressLint("TrustAllX509TrustManager")
    public void checkServerTrusted(X509Certificate[] chain, String authType, Socket socket) throws CertificateException {
      String hostname = peerHost(socket);
      if (isAllowedHost(hostname)) {
        Log.w(TAG, "HTTPS certificate accepted for configured backend: host=" + normalizeHost(hostname) + ", authType=" + authType + ", chainLength=" + chainLength(chain));
        return;
      }

      Log.w(TAG, "HTTPS certificate uses default validation: host=" + hostname);
      delegate.checkServerTrusted(chain, authType);
    }

    @Override
    @SuppressLint("TrustAllX509TrustManager")
    public void checkServerTrusted(X509Certificate[] chain, String authType, SSLEngine engine) throws CertificateException {
      String hostname = engine != null && engine.getHandshakeSession() != null ? engine.getHandshakeSession().getPeerHost() : null;
      if (isAllowedHost(hostname)) {
        Log.w(TAG, "HTTPS certificate accepted for configured backend: host=" + normalizeHost(hostname) + ", authType=" + authType + ", chainLength=" + chainLength(chain));
        return;
      }

      Log.w(TAG, "HTTPS certificate uses default validation: host=" + hostname);
      delegate.checkServerTrusted(chain, authType);
    }

    @Override
    public X509Certificate[] getAcceptedIssuers() {
      return delegate.getAcceptedIssuers();
    }

    private String peerHost(Socket socket) {
      if (socket instanceof SSLSocket) {
        SSLSession session = ((SSLSocket) socket).getHandshakeSession();
        if (session != null) return session.getPeerHost();
      }
      return null;
    }

    private int chainLength(X509Certificate[] chain) {
      return chain == null ? 0 : chain.length;
    }
  }
}
