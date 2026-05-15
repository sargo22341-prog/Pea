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

public class MainActivity extends BridgeActivity {
  private static final String TAG = "PEA_SSL";

  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(PEANetworkPlugin.class);
    super.onCreate(savedInstanceState);
    PEASelfHostedSsl.install();

    if (getBridge() != null && getBridge().getWebView() != null) {
      getBridge().getWebView().getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
      getBridge().setWebViewClient(new SelfHostedWebViewClient());
    }
  }

  private class SelfHostedWebViewClient extends BridgeWebViewClient {
    SelfHostedWebViewClient() {
      super(getBridge());
    }

    @Override
    @SuppressLint("WebViewClientOnReceivedSslError")
    public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
      String hostname = android.net.Uri.parse(error.getUrl()).getHost();
      if (PEASelfHostedSsl.isAllowedHost(hostname)) {
        Log.w(TAG, "WebView SSL error accepted for configured backend: " + describeSslError(error));
        handler.proceed();
        return;
      }

      Log.w(TAG, "WebView SSL error refused for unconfigured host: " + describeSslError(error));
      handler.cancel();
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
