# Android release 签名配置（prebuild 重新生成 android/ 后需要重新应用）

`apps/mobile/android` 目录由 `npx expo prebuild -p android` 生成并被 gitignore。
重新 prebuild 后，把以下内容应用到 `android/app/build.gradle` 的 `signingConfigs` / `buildTypes` 块，
并保持 `android/keystore.properties` 与 `android/app/pathpilot.keystore` 存在（见仓库外备份说明）。

```gradle
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            if (project.hasProperty('PathPilotReleaseStoreFile')) {
                storeFile file(PathPilotReleaseStoreFile)
                storePassword PathPilotReleaseStorePassword
                keyAlias PathPilotReleaseKeyAlias
                keyPassword PathPilotReleaseKeyPassword
            } else {
                def keystorePropsFile = rootProject.file("keystore.properties")
                if (keystorePropsFile.exists()) {
                    def keystoreProps = new Properties()
                    keystoreProps.load(new FileInputStream(keystorePropsFile))
                    storeFile file(keystoreProps['storeFile'])
                    storePassword keystoreProps['storePassword']
                    keyAlias keystoreProps['keyAlias']
                    keyPassword keystoreProps['keyPassword']
                }
            }
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.release
            // …其余保持 prebuild 生成的内容不变
```

keystore 生成命令（已执行，备份在本地）：

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore pathpilot.keystore \
  -alias pathpilot -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass pathpilot2026 -keypass pathpilot2026 \
  -dname "CN=PathPilot, OU=Dev, O=PathPilot, L=Beijing, C=CN"
```

`keystore.properties`：

```properties
storeFile=pathpilot.keystore
storePassword=pathpilot2026
keyAlias=pathpilot
keyPassword=pathpilot2026
```
