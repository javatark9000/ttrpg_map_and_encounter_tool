FROM composer:2 AS vendor
WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --prefer-dist --no-interaction --no-progress --optimize-autoloader

FROM php:8.3-cli-alpine
RUN docker-php-ext-install pdo_mysql pcntl posix
WORKDIR /app
COPY --from=vendor /app/vendor ./vendor
COPY . .
RUN mkdir -p storage/uploads && chown -R www-data:www-data storage vendor/workerman
USER www-data
EXPOSE 8080 8081
CMD ["php", "-S", "0.0.0.0:8080", "-t", "public", "public/index.php"]
