/**
 * E-commerce Tracking Example
 *
 * This example demonstrates how to track e-commerce events
 * like product views, add to cart, and purchases.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import LinkForty from '@linkforty/react-native-sdk';

export default function ProductScreen({ route }) {
  const { productId } = route.params;
  const [product, setProduct] = useState(null);

  useEffect(() => {
    // Track product view
    trackProductView(productId);

    // Fetch product data
    fetchProduct(productId);
  }, [productId]);

  const fetchProduct = async (id: string) => {
    // Your API call here
    const productData = {
      id,
      name: 'Premium Subscription',
      price: 99.99,
      currency: 'USD',
    };
    setProduct(productData);
  };

  const trackProductView = async (id: string) => {
    try {
      await LinkForty.trackEvent('product_view', {
        product_id: id,
        timestamp: new Date().toISOString(),
      });
      console.log('Product view tracked');
    } catch (error) {
      console.error('Failed to track product view:', error);
    }
  };

  const handleAddToCart = async () => {
    if (!product) return;

    try {
      // Track add to cart event
      await LinkForty.trackEvent('add_to_cart', {
        product_id: product.id,
        product_name: product.name,
        price: product.price,
        currency: product.currency,
        quantity: 1,
      });

      console.log('Add to cart event tracked');
      // Navigate to cart or show confirmation
    } catch (error) {
      console.error('Failed to track add to cart:', error);
    }
  };

  const handlePurchase = async () => {
    if (!product) return;

    try {
      // Process payment with your payment processor
      const orderId = await processPayment(product);

      // Track purchase event (conversion event)
      await LinkForty.trackEvent('purchase', {
        order_id: orderId,
        product_id: product.id,
        product_name: product.name,
        amount: product.price,
        currency: product.currency,
        quantity: 1,
        payment_method: 'credit_card',
        timestamp: new Date().toISOString(),
      });

      console.log('Purchase event tracked - this triggers webhooks!');

      // Show success message and navigate
      alert('Purchase successful!');
    } catch (error) {
      console.error('Purchase failed:', error);
    }
  };

  const processPayment = async (product) => {
    // Your payment processing logic
    return 'ORDER-' + Date.now();
  };

  if (!product) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{product.name}</Text>
      <Text style={styles.price}>
        ${product.price} {product.currency}
      </Text>

      <View style={styles.buttonContainer}>
        <Button title="Add to Cart" onPress={handleAddToCart} />
        <Button title="Buy Now" onPress={handlePurchase} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  price: {
    fontSize: 20,
    color: '#26adae',
    marginBottom: 20,
  },
  buttonContainer: {
    gap: 10,
  },
});
