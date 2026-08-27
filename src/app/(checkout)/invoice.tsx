import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, Platform, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRestaurantStore } from '../../store';

export default function InvoiceScreen() {
  const { selectedOutlet } = useRestaurantStore();
  const router = useRouter();
  const params = useLocalSearchParams();
  const [downloading, setDownloading] = useState(false);
  const [rating, setRating] = useState<string | null>(null);
  const [branchName, setBranchName] = useState('Data Udipi — Mugalivakkam');
  const [branchAddress, setBranchAddress] = useState('Mount-Poonamallee Road, Mugalivakkam, Chennai 600125');

  useEffect(() => {
    if (selectedOutlet) {
      if (selectedOutlet.name) setBranchName(selectedOutlet.name);
      if (selectedOutlet.address) setBranchAddress(selectedOutlet.address);
    }
  }, [selectedOutlet]);

  const orderId = params.orderId as string || 'DU104-100034372TE';
  const subtotalVal = parseFloat((params.subtotal as string) || '0');
  const finalTotalVal = parseFloat((params.finalTotal as string) || '0');
  const discountAmountVal = parseFloat((params.discountAmount as string) || '0');
  const discountCodeStr = (params.discountCode as string) || '';
  const mobileNumber = (params.mobileNumber as string) || 'WALK-IN';
  const customerName = (params.customerName as string) || (mobileNumber === 'WALK-IN' ? 'WALK-IN' : 'REGISTERED');
  const paymentMethod = (params.paymentMethod as string) || 'UPI';
  const orderType = (params.orderType as string) || 'Dine In';

  let cartData: any[] = [];
  try {
    if (params.cartData) {
      cartData = typeof params.cartData === 'string' ? JSON.parse(params.cartData) : params.cartData;
    }
  } catch (e) {
    console.error("Error parsing cart data", e);
  }

  const totalQty = cartData.reduce((acc, item) => acc + parseInt(item.quantity || item.qty || 1, 10), 0);
  const now = new Date();
  const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  const netTaxableVal = finalTotalVal / 1.05;
  const cgstVal = (finalTotalVal - netTaxableVal) / 2;
  const sgstVal = cgstVal;
  const totalGstVal = cgstVal + sgstVal;

  const subtotal = subtotalVal.toFixed(2);
  const discountAmount = discountAmountVal.toFixed(2);
  const finalTotal = finalTotalVal.toFixed(2);
  const netTaxable = netTaxableVal.toFixed(2);
  const cgst = cgstVal.toFixed(2);
  const sgst = sgstVal.toFixed(2);
  const totalGst = totalGstVal.toFixed(2);

  const getAssetBase64 = async (assetRequire: any) => {
    try {
      const source = Image.resolveAssetSource(assetRequire);
      if (!source || !source.uri) return '';

      const uri = source.uri;
      if (Platform.OS === 'web') {
        return uri;
      }

      const isPng = uri.toLowerCase().includes('.png');
      const mimeType = isPng ? 'image/png' : 'image/jpeg';

      if (uri.startsWith('http://') || uri.startsWith('https://')) {
        const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
        const ext = isPng ? 'png' : 'jpg';
        const localPath = `${cacheDir}temp_asset_${Math.random().toString(36).substring(7)}.${ext}`;
        const result = await FileSystem.downloadAsync(uri, localPath);
        const base64 = await FileSystem.readAsStringAsync(result.uri, {
          encoding: 'base64',
        });
        try {
          await FileSystem.deleteAsync(localPath, { idempotent: true });
        } catch (e) { }
        return `data:${mimeType};base64,${base64}`;
      } else {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: 'base64',
        });
        return `data:${mimeType};base64,${base64}`;
      }
    } catch (err) {
      console.warn("Could not load asset as base64", err);
      return Image.resolveAssetSource(assetRequire)?.uri || '';
    }
  };

  const generatePDF = async () => {
    setDownloading(true);
    try {
      const bannerBase64 = await getAssetBase64(require('../../../assets/images/frontpage_bg.png'));
      const logoBase64 = await getAssetBase64(require('../../../assets/images/udupi-banner.png'));
      const qrCodeUrl = paymentMethod.toUpperCase() === 'UPI'
        ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=upi://pay?pa=dataudipi@upi%26pn=DataUdipi%26am=${finalTotal}%26cu=INR`
        : `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=CashPaymentConfirmed`;

      let itemsHtml = '';
      cartData.forEach((item, idx) => {
        const itemCode = 70000 + (item.menu_item_id || item.id || idx + 1);
        const name = (item.name || item.itemName || 'ITEM').toUpperCase();
        const price = parseFloat(item.price || 0).toFixed(2);
        const qty = String(item.quantity || item.qty || 1).padStart(3, '0');
        const netAmt = (parseFloat(item.price || 0) * parseInt(qty, 10)).toFixed(2);

        itemsHtml += `
          <tr>
            <td>${name}</td>
            <td>₹${price}</td>
            <td class="center">${qty}</td>
            <td class="right">₹${netAmt}</td>
          </tr>
        `;
      });

      const htmlContent = `
        <html>
        <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #333;
            margin: 0;
            padding: 10px;
            background-color: #ffffff;
            display: flex;
            justify-content: center;
          }
          .invoice-card {
            background-color: #fff;
            max-width: 450px;
            width: 100%;
            padding: 16px;
            box-sizing: border-box;
          }
          .banner {
            position: relative;
            height: 80px;
            margin-bottom: 12px;
            border-radius: 8px;
            overflow: hidden;
            display: flex;
            justify-content: center;
            align-items: center;
            background-color: #ff5a1f;
          }
          .banner-img {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            opacity: 0.9;
          }
          .banner-text {
            position: relative;
            z-index: 2;
            color: #fff;
            font-size: 13px;
            font-weight: bold;
            letter-spacing: 2px;
            text-shadow: 1px 1px 3px rgba(0,0,0,0.8);
          }
          .logo-container {
            text-align: center;
            margin-bottom: 8px;
          }
          .logo-image {
            max-width: 180px;
            height: 35px;
            object-fit: contain;
          }
          .brand-row {
            display: flex;
            align-items: flex-start;
            margin-bottom: 12px;
            font-size: 11px;
            color: #444;
            line-height: 1.4;
          }
          .brand-name {
            font-weight: bold;
            margin-right: 8px;
          }
          .brand-address {
            color: #000;
            font-weight: bold;
          }
          .company-info {
            text-align: center;
            font-size: 10px;
            color: #555;
            margin-bottom: 12px;
            line-height: 1.4;
          }
          .company-name {
            font-weight: bold;
            font-size: 12px;
            color: #111;
            margin-bottom: 2px;
          }
          .divider {
            border-top: 1px dashed #bbb;
            margin: 10px 0;
          }
          .invoice-title {
            text-align: center;
            font-weight: bold;
            font-size: 15px;
            letter-spacing: 1px;
            color: #000;
            margin: 8px 0;
          }
          .meta-container {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            color: #333;
            margin-bottom: 8px;
            line-height: 1.5;
          }
          .meta-left {
            font-weight: bold;
          }
          .meta-right {
            text-align: right;
          }
          .table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 8px;
          }
          .table th {
            font-size: 11px;
            font-weight: bold;
            color: #000;
            border-bottom: 1px dashed #bbb;
            padding: 6px 0;
            text-align: left;
          }
          .table td {
            font-size: 11px;
            color: #333;
            padding: 6px 0;
            border-bottom: 1px solid #eee;
          }
          .table td.center, .table th.center {
            text-align: center;
          }
          .table td.right, .table th.right {
            text-align: right;
          }
          .totals-container {
            margin-top: 12px;
            display: flex;
            flex-direction: column;
            gap: 5px;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            color: #444;
          }
          .total-row.bold {
            font-weight: bold;
            color: #000;
            font-size: 13px;
            margin-top: 3px;
          }
          .payment-section {
            margin-top: 12px;
            font-size: 11px;
            color: #333;
          }
          .payment-title {
            font-weight: bold;
            text-align: center;
            margin-bottom: 8px;
            font-size: 12px;
            color: #000;
          }
          .qr-section {
            text-align: center;
            margin: 15px 0;
          }
          .qr-image {
            width: 120px;
            height: 120px;
          }
          .terms {
            text-align: center;
            font-size: 9px;
            color: #666;
            line-height: 1.4;
          }
        </style>
        </head>
        <body>
        <div class="invoice-card">
          ${bannerBase64 ? `
          <div class="banner">
            <img src="${bannerBase64}" class="banner-img" />
            <div class="banner-text">40 YEARS OF EXCELLENCE</div>
          </div>
          ` : ''}
          
          ${logoBase64 ? `
          <div class="logo-container">
            <img src="${logoBase64}" class="logo-image" />
          </div>
          ` : ''}
          
          <div class="brand-row">
            <span class="brand-name">${branchName.split(' — ')[0]} :</span>
            <div style="flex: 1;">
              <div class="brand-address">${branchAddress}</div>
              <div style="display: flex; justify-content: flex-end; align-items: center; margin-top: 4px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ff4500" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
                <span style="color: #ff4500; font-size: 10px; margin-left: 2px; font-weight: bold;">location</span>
              </div>
            </div>
          </div>

          <div class="company-info">
            <div class="company-name">Data Udipi Limited</div>
            <div>Place Of Supply : ${branchName} - ${branchAddress}.</div>
            <div>Regd. Office: Chennai.</div>
            <div style="font-weight: bold; margin-top: 2px;">GSTIN NO: 29AAACT1836J1ZC</div>
          </div>

          <div class="divider"></div>
          <div class="invoice-title">TAX INVOICE</div>
          <div class="divider"></div>

          <div class="meta-container">
            <div class="meta-left">
              <div>Invoice No : ${orderId}</div>
              <div>Order Type : ${orderType}</div>
              <div>Counter : 4</div>
              <div>Mobile No : ${mobileNumber}</div>
            </div>
            <div class="meta-right">
              <div>${formattedDate}</div>
            </div>
          </div>

          <div class="divider"></div>
          
          <table class="table">
            <thead>
              <tr>
                <th style="width: 50%;">Description</th>
                <th class="center" style="width: 15%;">Price</th>
                <th class="center" style="width: 15%;">QTY</th>
                <th class="right" style="width: 20%;">Net Amt</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div class="divider"></div>

          <div class="totals-container">
            <div class="total-row"><span>Gross Total :</span><span>₹${subtotal}</span></div>
            ${discountAmountVal > 0 ? `<div class="total-row" style="color: #00a01d;"><span>Discount (${discountCodeStr}) :</span><span>-₹${discountAmount}</span></div>` : ''}
            <div class="total-row"><span>Net Taxable Value :</span><span>₹${netTaxable}</span></div>
            <div class="total-row"><span>CGST @ 2.5% :</span><span>₹${cgst}</span></div>
            <div class="total-row"><span>SGST @ 2.5% :</span><span>₹${sgst}</span></div>
            <div class="total-row"><span>Total GST Amount :</span><span>₹${totalGst}</span></div>
            <div class="total-row bold"><span>Total Invoice Amount :</span><span>₹${finalTotal}</span></div>
          </div>

          <div class="divider"></div>

          <div class="payment-section">
            <div class="payment-title">Payment & Delivery</div>
            <div class="total-row">
              <span>${paymentMethod.toUpperCase()}</span>
              <span style="font-weight: bold;">₹${finalTotal}</span>
            </div>
            <div class="total-row" style="font-weight: bold; margin-top: 3px;">
              <span>Total received amount :</span>
              <span>₹${finalTotal}</span>
            </div>
            <div class="divider"></div>
            <div class="total-row">
              <span>No of items : ${String(cartData.length).padStart(2, '0')}</span>
              <span>Total qty : ${totalQty.toFixed(2)}</span>
            </div>
          </div>

          <div class="qr-section">
            <img src="${qrCodeUrl}" class="qr-image" />
          </div>

          <div class="terms">
            <div>Terms: * Taxes extra as applicable.</div>
            <div>No return / exchange on prepared food items.</div>
            <div style="font-weight: bold; margin-top: 2px;">Thank you for dining with us!</div>
          </div>
        </div>
        </body>
        </html>
      `;

      if (Platform.OS === 'web') {
        await Print.printAsync({ html: htmlContent });
      } else {
        const { uri } = await Print.printToFileAsync({ html: htmlContent });
        const safeUri = FileSystem.documentDirectory + `DataUdipi_Bill_${orderId}.pdf`;
        await FileSystem.moveAsync({ from: uri, to: safeUri });
        await Sharing.shareAsync(safeUri, { UTI: '.pdf', mimeType: 'application/pdf' });
      }
    } catch (error) {
      console.error('Error generating bill PDF', error);
      Alert.alert('Error', 'Failed to generate PDF');
    } finally {
      setDownloading(false);
    }
  };

  const qrUrl = paymentMethod.toUpperCase() === 'UPI'
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=upi://pay?pa=dataudipi@upi%26pn=DataUdipi%26am=${finalTotal}%26cu=INR`
    : `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=CashPaymentConfirmed`;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/home')} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Invoice</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.invoiceCard}>
          <View style={styles.banner}>
            <Image source={require('../../../assets/images/frontpage_bg.png')} style={styles.bannerImg} />
            <Text style={styles.bannerText}>40 YEARS OF EXCELLENCE</Text>
          </View>

          <View style={styles.logoContainer}>
            <Image source={require('../../../assets/images/udupi-banner.png')} style={styles.logoImage} resizeMode="contain" />
          </View>

          <View style={styles.brandRow}>
            <Text style={styles.brandName}>{branchName.split(' — ')[0]} : {branchAddress}</Text>
          </View>

          <View style={styles.companyInfo}>
            <Text style={styles.companyName}>Data Udipi Limited</Text>
            <Text style={styles.companyText}>Place Of Supply : {branchName} - {branchAddress}.</Text>
            <Text style={styles.companyText}>Regd. Office: Chennai.</Text>
            <Text style={styles.companyText}>GSTIN NO: 29AAACT1836J1ZC</Text>
          </View>

          <View style={styles.divider} />
          <Text style={styles.invoiceTitle}>TAX INVOICE</Text>
          <View style={styles.divider} />

          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Invoice No : {orderId}</Text>
            <Text style={styles.metaValue}>{formattedDate}</Text>
          </View>
          <Text style={styles.metaLabel}>Order Type : {orderType}</Text>
          <Text style={styles.metaLabel}>Counter : 4</Text>
          <Text style={styles.metaLabel}>Customer : {customerName}</Text>
          <Text style={styles.metaLabel}>Mobile No : {mobileNumber}</Text>

          <View style={styles.divider} />

          <View style={styles.tableHeader}>
            <Text style={[styles.tableCol, { flex: 2 }]}>Description</Text>
            <Text style={[styles.tableCol, { flex: 1, textAlign: 'center' }]}>Price</Text>
            <Text style={[styles.tableCol, { flex: 1, textAlign: 'center' }]}>QTY</Text>
            <Text style={[styles.tableCol, { flex: 1, textAlign: 'right' }]}>Net Amt</Text>
          </View>

          {cartData.map((item, idx) => (
            <View key={idx} style={styles.tableRow}>
              <Text style={[styles.tableColData, { flex: 2 }]} numberOfLines={2}>{(item.name || item.itemName || 'ITEM').toUpperCase()}</Text>
              <Text style={[styles.tableColData, { flex: 1, textAlign: 'center' }]}>₹{parseFloat(item.price || 0).toFixed(2)}</Text>
              <Text style={[styles.tableColData, { flex: 1, textAlign: 'center' }]}>{String(item.quantity || item.qty || 1).padStart(3, '0')}</Text>
              <Text style={[styles.tableColData, { flex: 1, textAlign: 'right' }]}>₹{(parseFloat(item.price || 0) * parseInt(item.quantity || item.qty || 1, 10)).toFixed(2)}</Text>
            </View>
          ))}

          <View style={styles.divider} />

          <View style={styles.totalsContainer}>
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Gross Total :</Text><Text style={styles.totalValue}>₹{subtotal}</Text></View>
            {discountAmountVal > 0 && (
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: '#00a01d' }]}>Discount ({discountCodeStr}) :</Text>
                <Text style={[styles.totalValue, { color: '#00a01d' }]}>-₹{discountAmount}</Text>
              </View>
            )}
            <View style={styles.totalRow}><Text style={styles.totalLabelBold}>Total Invoice Amount :</Text><Text style={styles.totalValueBold}>₹{finalTotal}</Text></View>
          </View>

          <View style={styles.divider} />

          <View style={styles.paymentDelivery}>
            <Text style={styles.paymentTitle}>Payment & Delivery</Text>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{paymentMethod.toUpperCase()}</Text>
              <Text style={styles.totalValueBold}>₹{finalTotal}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabelBold}>Total received amount :</Text>
              <Text style={styles.totalValueBold}>₹{finalTotal}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>No of items : {String(cartData.length).padStart(2, '0')}</Text>
              <Text style={styles.totalLabel}>Total qty : {totalQty.toFixed(2)}</Text>
            </View>
          </View>

          <View style={styles.qrSection}>
            <Image source={{ uri: qrUrl }} style={styles.qrImage} />
          </View>

          <View style={styles.terms}>
            <Text style={styles.termText}>Terms: * Taxes extra as applicable.</Text>
            <Text style={styles.termText}>No return / exchange on prepared food items.</Text>
            <Text style={styles.termText}>Thank you for dining with us!</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.downloadBtn}
            onPress={generatePDF}
            disabled={downloading}
          >
            {downloading ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} /> : <Ionicons name="download" size={18} color="#fff" style={{ marginRight: 8 }} />}
            <Text style={styles.downloadBtnText}>{downloading ? 'Generating...' : 'Download bill'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.backBtn} onPress={() => { router.dismissAll(); router.replace('/home'); }}>
            <Ionicons name="home" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.backBtnText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f4f4',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  invoiceCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  banner: {
    position: 'relative',
    height: 100,
    marginBottom: 16,
    borderRadius: 8,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerImg: {
    ...(StyleSheet.absoluteFill as any),
  },
  bannerText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 3,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  logoImage: {
    width: 200,
    height: 40,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  brandName: {
    fontWeight: 'bold',
    fontSize: 16,
    marginRight: 8,
  },
  brandAddress: {
    flex: 1,
    fontSize: 11,
    color: '#555',
  },
  experience: {
    backgroundColor: '#f9f9f9',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  experienceTitle: {
    fontWeight: 'bold',
    marginBottom: 12,
  },
  smileys: {
    flexDirection: 'row',
    gap: 16,
  },
  smiley: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  smileyActive: {
    backgroundColor: '#f0f0f0',
  },
  companyInfo: {
    alignItems: 'center',
    marginBottom: 16,
  },
  companyName: {
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 4,
  },
  companyText: {
    fontSize: 11,
    color: '#555',
    textAlign: 'center',
    marginBottom: 2,
  },
  divider: {
    height: 1,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#ccc',
    marginVertical: 12,
  },
  invoiceTitle: {
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 16,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 12,
    color: '#555',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    marginBottom: 8,
  },
  tableCol: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#333',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
  },
  tableColData: {
    fontSize: 11,
    color: '#444',
  },
  totalsContainer: {
    gap: 6,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 12,
    color: '#555',
  },
  totalValue: {
    fontSize: 12,
    color: '#333',
  },
  totalLabelBold: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#000',
  },
  totalValueBold: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#000',
  },
  paymentDelivery: {
    marginBottom: 16,
  },
  paymentTitle: {
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  qrSection: {
    alignItems: 'center',
    marginVertical: 16,
  },
  qrImage: {
    width: 150,
    height: 150,
  },
  terms: {
    alignItems: 'center',
    marginBottom: 16,
  },
  termText: {
    fontSize: 10,
    color: '#555',
    marginBottom: 4,
    textAlign: 'center',
  },
  actions: {
    marginTop: 20,
    gap: 12,
  },
  downloadBtn: {
    flexDirection: 'row',
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  backBtn: {
    flexDirection: 'row',
    backgroundColor: '#ff5a1f',
    paddingVertical: 14,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
