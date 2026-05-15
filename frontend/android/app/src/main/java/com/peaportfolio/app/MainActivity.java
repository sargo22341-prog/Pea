package com.peaportfolio.app;

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.webkit.SslErrorHandler;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
  private static final String TAG = "PEA_SSL";
  private static final int APP_BACKGROUND_COLOR = Color.rgb(7, 16, 20);

  @Override
  public void onCreate(Bundle savedInstanceState) {
    getApplication().setTheme(R.style.AppTheme_NoActionBar);
    setTheme(R.style.AppTheme_NoActionBar);
    supportRequestWindowFeature(Window.FEATURE_NO_TITLE);
    registerPlugin(PEANetworkPlugin.class);
    configureEdgeToEdgeWindow();
    super.onCreate(savedInstanceState);
    hideNativeActionBar();
    configureEdgeToEdgeWindow();
    PEASelfHostedSsl.install();

    if (getBridge() != null && getBridge().getWebView() != null) {
      getBridge().getWebView().getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
      getBridge().setWebViewClient(new SelfHostedWebViewClient());
    }
  }

  private void hideNativeActionBar() {
    if (getSupportActionBar() != null) {
      getSupportActionBar().hide();
    }

    int actionBarContainerId = getResources().getIdentifier("action_bar_container", "id", "android");
    View actionBarContainer = findViewById(actionBarContainerId);
    if (actionBarContainer != null) {
      actionBarContainer.setVisibility(View.GONE);
    }
  }

  private void configureEdgeToEdgeWindow() {
    Window window = getWindow();
    WindowCompat.setDecorFitsSystemWindows(window, false);
    window.getDecorView().setBackgroundColor(APP_BACKGROUND_COLOR);
    window.setStatusBarColor(Color.TRANSPARENT);
    window.setNavigationBarColor(Color.TRANSPARENT);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      window.setNavigationBarDividerColor(Color.TRANSPARENT);
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.setStatusBarContrastEnforced(false);
      window.setNavigationBarContrastEnforced(false);
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
