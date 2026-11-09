package io.ionic.starter;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.os.SystemClock;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.Arrays;
import java.util.UUID;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "LicenseSecurity")
public class LicenseSecurityPlugin extends Plugin {
    private static final String SIGNING_KEY_ALIAS = "sports-school-install-signing-v1";
    private static final String STORAGE_KEY_ALIAS = "sports-school-license-storage-v1";
    private static final String PREFERENCES_NAME = "sports_school_license_secure_v1";
    private static final String STATE_PREFERENCE_KEY = "encrypted_state";
    private static final String INSTALLATION_ID_KEY = "installation_id";
    private static final String LICENSE_STATE_KEY = "license_state";
    private static final int AES_GCM_IV_BYTES = 12;
    private static final int AES_GCM_TAG_BITS = 128;

    @PluginMethod
    public void getOrCreateIdentity(PluginCall call) {
        try {
            KeyPair keyPair = getOrCreateSigningKeyPair();
            ECPublicKey publicKey = (ECPublicKey) keyPair.getPublic();
            String x = base64Url(toFixedWidth(publicKey.getW().getAffineX()));
            String y = base64Url(toFixedWidth(publicKey.getW().getAffineY()));
            String canonicalJwk = "{\"crv\":\"P-256\",\"kty\":\"EC\",\"x\":\""
                + x + "\",\"y\":\"" + y + "\"}";
            String thumbprint = base64Url(
                MessageDigest.getInstance("SHA-256")
                    .digest(canonicalJwk.getBytes(StandardCharsets.UTF_8))
            );

            JSONObject state = readState();
            String installationId = state.optString(INSTALLATION_ID_KEY, "");
            if (installationId.isEmpty()) {
                installationId = UUID.randomUUID().toString();
                state.put(INSTALLATION_ID_KEY, installationId);
                writeState(state);
            }

            JSObject jwk = new JSObject();
            jwk.put("kty", "EC");
            jwk.put("crv", "P-256");
            jwk.put("x", x);
            jwk.put("y", y);

            JSObject result = new JSObject();
            result.put("installationId", installationId);
            result.put("publicKeyJwk", jwk);
            result.put("publicKeyThumbprint", thumbprint);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("LICENSE_IDENTITY_UNAVAILABLE", error);
        }
    }

    @PluginMethod
    public void getRuntimeClock(PluginCall call) {
        JSObject result = new JSObject();
        result.put("wallTimeMs", System.currentTimeMillis());
        result.put("elapsedRealtimeMs", SystemClock.elapsedRealtime());
        call.resolve(result);
    }

    @PluginMethod
    public void signDeviceProof(PluginCall call) {
        try {
            String message = call.getString("message");
            if (message == null || message.isEmpty() || message.length() > 4096) {
                call.reject("LICENSE_PROOF_MESSAGE_INVALID");
                return;
            }

            KeyPair keyPair = getOrCreateSigningKeyPair();
            Signature signer = Signature.getInstance("SHA256withECDSA");
            signer.initSign(keyPair.getPrivate());
            signer.update(message.getBytes(StandardCharsets.UTF_8));
            String proof = base64Url(derToP1363(signer.sign()));

            JSObject result = new JSObject();
            result.put("proof", proof);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("LICENSE_PROOF_SIGNING_FAILED", error);
        }
    }

    @PluginMethod
    public void saveLicenseState(PluginCall call) {
        try {
            String value = call.getString("value");
            if (value == null || value.length() > 65536) {
                call.reject("LICENSE_STATE_INVALID");
                return;
            }

            JSONObject state = readState();
            state.put(LICENSE_STATE_KEY, value);
            writeState(state);
            call.resolve();
        } catch (Exception error) {
            call.reject("LICENSE_STATE_SAVE_FAILED", error);
        }
    }

    @PluginMethod
    public void loadLicenseState(PluginCall call) {
        try {
            JSONObject state = readState();
            String value = state.has(LICENSE_STATE_KEY)
                ? state.getString(LICENSE_STATE_KEY)
                : null;
            JSObject result = new JSObject();
            result.put("value", value);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("LICENSE_STATE_LOAD_FAILED", error);
        }
    }

    @PluginMethod
    public void clearLicenseState(PluginCall call) {
        try {
            JSONObject state = readState();
            state.remove(LICENSE_STATE_KEY);
            writeState(state);
            call.resolve();
        } catch (Exception error) {
            call.reject("LICENSE_STATE_CLEAR_FAILED", error);
        }
    }

    private KeyPair getOrCreateSigningKeyPair() throws Exception {
        KeyStore keyStore = loadKeyStore();
        if (keyStore.containsAlias(SIGNING_KEY_ALIAS)) {
            Key privateKey = keyStore.getKey(SIGNING_KEY_ALIAS, null);
            return new KeyPair(
                keyStore.getCertificate(SIGNING_KEY_ALIAS).getPublicKey(),
                (java.security.PrivateKey) privateKey
            );
        }

        KeyPairGenerator generator = KeyPairGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_EC,
            "AndroidKeyStore"
        );
        generator.initialize(
            new KeyGenParameterSpec.Builder(
                SIGNING_KEY_ALIAS,
                KeyProperties.PURPOSE_SIGN | KeyProperties.PURPOSE_VERIFY
            )
                .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                .setDigests(KeyProperties.DIGEST_SHA256)
                .setUserAuthenticationRequired(false)
                .build()
        );
        return generator.generateKeyPair();
    }

    private JSONObject readState() throws Exception {
        String encoded = preferences().getString(STATE_PREFERENCE_KEY, null);
        if (encoded == null) {
            return new JSONObject();
        }

        byte[] packed = Base64.decode(encoded, Base64.NO_WRAP);
        if (packed.length <= AES_GCM_IV_BYTES) {
            throw new IllegalStateException("Stored license state is incomplete");
        }

        byte[] iv = Arrays.copyOfRange(packed, 0, AES_GCM_IV_BYTES);
        byte[] ciphertext = Arrays.copyOfRange(
            packed,
            AES_GCM_IV_BYTES,
            packed.length
        );
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(
            Cipher.DECRYPT_MODE,
            getOrCreateStorageKey(),
            new GCMParameterSpec(AES_GCM_TAG_BITS, iv)
        );
        byte[] cleartext = cipher.doFinal(ciphertext);
        return new JSONObject(new String(cleartext, StandardCharsets.UTF_8));
    }

    private void writeState(JSONObject state) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateStorageKey());
        byte[] iv = cipher.getIV();
        byte[] ciphertext = cipher.doFinal(
            state.toString().getBytes(StandardCharsets.UTF_8)
        );
        ByteArrayOutputStream packed = new ByteArrayOutputStream();
        packed.write(iv);
        packed.write(ciphertext);

        boolean saved = preferences()
            .edit()
            .putString(
                STATE_PREFERENCE_KEY,
                Base64.encodeToString(packed.toByteArray(), Base64.NO_WRAP)
            )
            .commit();
        if (!saved) {
            throw new IllegalStateException("Unable to persist protected state");
        }
    }

    private SecretKey getOrCreateStorageKey() throws Exception {
        KeyStore keyStore = loadKeyStore();
        if (keyStore.containsAlias(STORAGE_KEY_ALIAS)) {
            return (SecretKey) keyStore.getKey(STORAGE_KEY_ALIAS, null);
        }

        KeyGenerator generator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            "AndroidKeyStore"
        );
        generator.init(
            new KeyGenParameterSpec.Builder(
                STORAGE_KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .setUserAuthenticationRequired(false)
                .build()
        );
        return generator.generateKey();
    }

    private KeyStore loadKeyStore() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        return keyStore;
    }

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(
            PREFERENCES_NAME,
            Context.MODE_PRIVATE
        );
    }

    private byte[] toFixedWidth(BigInteger value) {
        byte[] bytes = value.toByteArray();
        int offset = bytes.length > 1 && bytes[0] == 0 ? 1 : 0;
        int length = bytes.length - offset;
        if (length > 32) {
            throw new IllegalArgumentException("Invalid P-256 coordinate");
        }
        byte[] fixed = new byte[32];
        System.arraycopy(bytes, offset, fixed, fixed.length - length, length);
        return fixed;
    }

    private byte[] derToP1363(byte[] der) {
        int[] position = {0};
        if (readByte(der, position) != 0x30) {
            throw new IllegalArgumentException("Invalid ECDSA signature");
        }
        int sequenceLength = readLength(der, position);
        int sequenceEnd = position[0] + sequenceLength;
        byte[] r = readInteger(der, position);
        byte[] s = readInteger(der, position);
        if (position[0] != sequenceEnd || sequenceEnd != der.length) {
            throw new IllegalArgumentException("Invalid ECDSA signature");
        }

        byte[] result = new byte[64];
        System.arraycopy(r, 0, result, 0, 32);
        System.arraycopy(s, 0, result, 32, 32);
        return result;
    }

    private byte[] readInteger(byte[] der, int[] position) {
        if (readByte(der, position) != 0x02) {
            throw new IllegalArgumentException("Invalid ECDSA signature");
        }
        int length = readLength(der, position);
        if (length < 1 || position[0] + length > der.length) {
            throw new IllegalArgumentException("Invalid ECDSA signature");
        }

        int offset = position[0];
        position[0] += length;
        while (length > 32 && der[offset] == 0) {
            offset++;
            length--;
        }
        if (length > 32) {
            throw new IllegalArgumentException("Invalid ECDSA integer");
        }

        byte[] fixed = new byte[32];
        System.arraycopy(der, offset, fixed, fixed.length - length, length);
        return fixed;
    }

    private int readByte(byte[] data, int[] position) {
        if (position[0] >= data.length) {
            throw new IllegalArgumentException("Invalid ECDSA signature");
        }
        return data[position[0]++] & 0xff;
    }

    private int readLength(byte[] data, int[] position) {
        int length = readByte(data, position);
        if ((length & 0x80) == 0) {
            return length;
        }
        int count = length & 0x7f;
        if (count < 1 || count > 2) {
            throw new IllegalArgumentException("Invalid ECDSA length");
        }
        int result = 0;
        for (int index = 0; index < count; index++) {
            result = (result << 8) | readByte(data, position);
        }
        return result;
    }

    private String base64Url(byte[] value) {
        return Base64.encodeToString(
            value,
            Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP
        );
    }
}
