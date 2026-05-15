package com.peaportfolio.app;

import android.annotation.SuppressLint;
import android.net.http.SslError;
import android.os.Bundle;
import android.util.Log;
import android.webkit.SslErrorHandler;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

public class MainActivity extends BridgeActivity {
  private static final String TAG = "PEA_SSL";

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    installSelfHostedTrustManager();

    if (getBridge() != null && getBridge().getWebView() != null) {
      getBridge().getWebView().getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
      getBridge().setWebViewClient(new SelfHostedWebViewClient());
    }
  }

  @SuppressLint({ "CustomX509TrustManager", "TrustAllX509TrustManager", "BadHostnameVerifier" })
  private void installSelfHostedTrustManager() {
    try {
      TrustManager[] trustManagers = new TrustManager[] {
        new X509TrustManager() {
          @Override
          public void checkClientTrusted(X509Certificate[] chain, String authType) {}

          @Override
          public void checkServerTrusted(X509Certificate[] chain, String authType) {
            Log.w(TAG, "HTTPS certificate accepted for self-hosted backend: authType=" + authType + ", chainLength=" + (chain == null ? 0 : chain.length));
          }

          @Override
          public X509Certificate[] getAcceptedIssuers() {
            return new X509Certificate[0];
          }
        }
      };

      SSLContext sslContext = SSLContext.getInstance("TLS");
      sslContext.init(null, trustManagers, new SecureRandom());
      HttpsURLConnection.setDefaultSSLSocketFactory(sslContext.getSocketFactory());
      HttpsURLConnection.setDefaultHostnameVerifier((hostname, session) -> {
        Log.w(TAG, "HTTPS hostname accepted for self-hosted backend: " + hostname);
        return true;
      });
      Log.w(TAG, "Self-hosted HTTPS trust manager installed for native HTTP requests.");
    } catch (Exception error) {
      Log.e(TAG, "Unable to install self-hosted HTTPS trust manager.", error);
    }
  }

  private class SelfHostedWebViewClient extends BridgeWebViewClient {
    SelfHostedWebViewClient() {
      super(getBridge());
    }

    @Override
    @SuppressLint("WebViewClientOnReceivedSslError")
    public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
      Log.w(TAG, "SSL error ignored for self-hosted backend: " + describeSslError(error));
      handler.proceed();
    }

    private String describeSslError(SslError error) {
      String primaryError;
      switch (error.getPrimaryError()) {
        case SslError.SSL_UNTRUSTED:
          primaryError = "SSL_UNTRUSTED";
          break;
        case SslError.SSL_EXPIRED:
          primaryError = "SSL_EXPIRED";
          break;
        case SslError.SSL_IDMISMATCH:
          primaryError = "SSL_IDMISMATCH";
          break;
        case SslError.SSL_NOTYETVALID:
          primaryError = "SSL_NOTYETVALID";
          break;
        case SslError.SSL_DATE_INVALID:
          primaryError = "SSL_DATE_INVALID";
          break;
        case SslError.SSL_INVALID:
          primaryError = "SSL_INVALID";
          break;
        default:
          primaryError = "SSL_ERROR_" + error.getPrimaryError();
          break;
      }

      return "url=" + error.getUrl() + ", primaryError=" + primaryError + ", certificate=" + error.getCertificate();
    }
  }
}
