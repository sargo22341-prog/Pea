package com.peaportfolio.app;

import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    if (isDebuggable() && getBridge() != null && getBridge().getWebView() != null) {
      getBridge().getWebView().getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
    }
  }

  private boolean isDebuggable() {
    return (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
  }
}
