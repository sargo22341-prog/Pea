package com.peaportfolio.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PEANetwork")
public class PEANetworkPlugin extends Plugin {
  @PluginMethod
  public void setBackendUrl(PluginCall call) {
    String url = call.getString("url");
    if (url == null || url.trim().isEmpty()) {
      call.reject("Backend URL is required.");
      return;
    }

    PEASelfHostedSsl.allowBackendUrl(url);
    JSObject result = new JSObject();
    result.put("ok", true);
    call.resolve(result);
  }
}
